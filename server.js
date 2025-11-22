const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const protobuf = require('protobufjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.proto')) {
      cb(null, true);
    } else {
      cb(new Error('Only .proto files are allowed'));
    }
  }
});

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Generate dummy data based on field type and custom rules
function generateDummyData(field, customRules = {}) {
  const fieldName = field.name;
  const fieldType = field.type;
  
  // Check if there's a custom rule for this field
  if (customRules[fieldName]) {
    const rule = customRules[fieldName];
    switch (rule.type) {
      case 'int':
        return rule.value || Math.floor(Math.random() * 1000);
      case 'guid':
        return rule.value || generateGuid();
      case 'string':
        return rule.value || `custom_${fieldName}`;
      default:
        return rule.value;
    }
  }

  // Default data generation based on type
  switch (fieldType) {
    case 'string':
      return `example_${fieldName}`;
    case 'int32':
    case 'int64':
    case 'uint32':
    case 'uint64':
    case 'sint32':
    case 'sint64':
    case 'fixed32':
    case 'fixed64':
    case 'sfixed32':
    case 'sfixed64':
      return Math.floor(Math.random() * 100);
    case 'float':
    case 'double':
      return Math.random() * 100;
    case 'bool':
      return Math.random() > 0.5;
    case 'bytes':
      return Buffer.from('example').toString('base64');
    default:
      // For nested messages or enums
      return null;
  }
}

// Generate GUID
function generateGuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Recursively generate dummy JSON from message type
function generateDummyJson(messageType, customRules = {}, root = null) {
  const json = {};
  
  if (!messageType.fields) {
    return json;
  }

  for (const fieldName in messageType.fields) {
    const field = messageType.fields[fieldName];
    
    // Check if the field has a resolved type
    let resolvedType = field.resolvedType;
    
    // If not resolved and we have a root, try to resolve it
    if (!resolvedType && field.type && root) {
      try {
        resolvedType = root.lookupType(field.type);
      } catch (e) {
        // Type not found, might be a primitive
      }
    }
    
    if (resolvedType && resolvedType.constructor.name === 'Type') {
      // Nested message type
      if (field.repeated) {
        json[fieldName] = [generateDummyJson(resolvedType, customRules, root)];
      } else {
        json[fieldName] = generateDummyJson(resolvedType, customRules, root);
      }
    } else if (resolvedType && resolvedType.constructor.name === 'Enum') {
      // Enum type
      const enumValues = Object.keys(resolvedType.values);
      json[fieldName] = enumValues[0] || 0;
    } else {
      // Primitive type
      if (field.repeated) {
        json[fieldName] = [generateDummyData(field, customRules)];
      } else {
        json[fieldName] = generateDummyData(field, customRules);
      }
    }
  }
  
  return json;
}

// Parse proto file and generate Postman request
app.post('/api/generate', apiLimiter, upload.single('protoFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No proto file uploaded' });
    }

    const { methodName, serviceName, customRules } = req.body;
    
    if (!methodName) {
      return res.status(400).json({ error: 'Method name is required' });
    }

    // Parse custom rules if provided with validation
    let parsedRules = {};
    if (customRules) {
      try {
        // Limit size to prevent DoS
        if (customRules.length > 10000) {
          return res.status(400).json({ error: 'Custom rules too large' });
        }
        parsedRules = JSON.parse(customRules);
        
        // Validate that it's an object
        if (typeof parsedRules !== 'object' || parsedRules === null || Array.isArray(parsedRules)) {
          return res.status(400).json({ error: 'Custom rules must be a JSON object' });
        }
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON in custom rules: ' + e.message });
      }
    }

    // Validate file path to prevent path traversal
    const filePath = path.resolve(req.file.path);
    const uploadsDir = path.resolve('uploads');
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    // Read and parse the proto file
    const protoContent = fs.readFileSync(filePath, 'utf8');
    const root = protobuf.parse(protoContent).root;

    // Find the service and method
    let service = null;
    let method = null;
    let requestType = null;

    // Search for the service and method recursively
    function findServiceAndMethod(namespace) {
      if (!namespace || service) return;
      
      if (namespace.nestedArray) {
        namespace.nestedArray.forEach(nested => {
          if (service) return;
          
          if (nested instanceof protobuf.Service) {
            if (!serviceName || nested.name === serviceName) {
              if (nested.methods[methodName]) {
                service = nested;
                method = nested.methods[methodName];
                requestType = root.lookupType(method.requestType);
              }
            }
          } else if (nested.nested) {
            findServiceAndMethod(nested);
          }
        });
      }
    }
    
    findServiceAndMethod(root);

    if (!method) {
      // Find all services for error message
      const allServices = [];
      function findAllServices(namespace) {
        if (!namespace) return;
        if (namespace.nestedArray) {
          namespace.nestedArray.forEach(nested => {
            if (nested instanceof protobuf.Service) {
              allServices.push({
                name: nested.name,
                methods: Object.keys(nested.methods)
              });
            } else if (nested.nested) {
              findAllServices(nested);
            }
          });
        }
      }
      findAllServices(root);
      
      // Clean up uploaded file
      fs.unlinkSync(filePath);
      return res.status(404).json({ 
        error: 'Method not found',
        availableServices: allServices
      });
    }

    // Generate dummy JSON data
    const dummyData = generateDummyJson(requestType, parsedRules, root);

    // Create Postman collection format
    const postmanRequest = {
      info: {
        name: `${service.name}.${methodName}`,
        description: `Generated from proto file`,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      item: [
        {
          name: methodName,
          request: {
            method: "POST",
            header: [
              {
                key: "Content-Type",
                value: "application/json"
              }
            ],
            body: {
              mode: "raw",
              raw: JSON.stringify(dummyData, null, 2)
            },
            url: {
              raw: `http://localhost:8080/${service.name}/${methodName}`,
              protocol: "http",
              host: ["localhost"],
              port: "8080",
              path: [service.name, methodName]
            },
            description: `Request for ${service.name}.${methodName}`
          },
          response: []
        }
      ]
    };

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      postmanCollection: postmanRequest,
      requestBody: dummyData,
      service: service.name,
      method: methodName
    });

  } catch (error) {
    console.error('Error processing proto file:', error);
    
    // Clean up uploaded file if it exists
    if (req.file) {
      const cleanupPath = path.resolve(req.file.path);
      const uploadsDir = path.resolve('uploads');
      if (cleanupPath.startsWith(uploadsDir) && fs.existsSync(cleanupPath)) {
        fs.unlinkSync(cleanupPath);
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to process proto file', 
      details: error.message 
    });
  }
});

// Get available services and methods from proto file
app.post('/api/inspect', apiLimiter, upload.single('protoFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No proto file uploaded' });
    }

    // Validate file path to prevent path traversal
    const filePath = path.resolve(req.file.path);
    const uploadsDir = path.resolve('uploads');
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    const protoContent = fs.readFileSync(filePath, 'utf8');
    const root = protobuf.parse(protoContent).root;

    const services = [];
    
    // Recursively find all services
    function findServices(namespace) {
      if (!namespace) return;
      
      if (namespace.nestedArray) {
        namespace.nestedArray.forEach(nested => {
          if (nested instanceof protobuf.Service) {
            services.push({
              name: nested.name,
              methods: Object.keys(nested.methods).map(methodName => ({
                name: methodName,
                requestType: nested.methods[methodName].requestType,
                responseType: nested.methods[methodName].responseType
              }))
            });
          } else if (nested.nested) {
            findServices(nested);
          }
        });
      }
    }
    
    findServices(root);

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({ services });

  } catch (error) {
    console.error('Error inspecting proto file:', error);
    
    if (req.file) {
      const cleanupPath = path.resolve(req.file.path);
      const uploadsDir = path.resolve('uploads');
      if (cleanupPath.startsWith(uploadsDir) && fs.existsSync(cleanupPath)) {
        fs.unlinkSync(cleanupPath);
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to inspect proto file', 
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
