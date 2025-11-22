# Proto to Postman Request Creator

A simple web application that creates valid Postman requests from Protocol Buffer (.proto) files with customizable dummy data generation.

## Features

- 📤 Upload and parse .proto files
- 🔍 Inspect available services and methods
- 🎲 Generate dummy JSON data based on proto field types
- ⚙️ Custom field rules for specific data generation (e.g., GUID, integers in strings)
- 📋 Export as Postman Collection format
- 🐳 Docker containerized for easy deployment
- 🚀 GitHub Actions workflow for automated deployment

## Quick Start

### Using Docker

1. **Build and run with Docker:**
   ```bash
   docker build -t proto-json-creator .
   docker run -p 3000:3000 proto-json-creator
   ```

2. **Or use Docker Compose:**
   ```bash
   docker-compose up
   ```

3. **Access the application:**
   Open your browser and navigate to `http://localhost:3000`

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Access the application:**
   Open your browser and navigate to `http://localhost:3000`

## Usage

### Step 1: Upload Proto File
- Click the file input and select your .proto file
- Optionally click "Inspect File" to see available services and methods

### Step 2: Select Service and Method
- Enter the service name (optional - will auto-detect if only one service exists)
- Enter the method name you want to generate a request for

### Step 3: Custom Field Rules (Optional)
- Define custom rules for specific fields
- For example, set "customerId" to generate as a GUID instead of a regular string
- Supported types:
  - **String**: Generate custom string values
  - **Integer**: Generate integer values (or integers as strings)
  - **GUID**: Generate UUID/GUID values

### Step 4: Generate
- Click "Generate Postman Request"
- View the generated Postman collection and request body
- Copy to clipboard or download as JSON file

## Example Proto File

```protobuf
syntax = "proto3";

package example;

service UserService {
  rpc CreateUser (CreateUserRequest) returns (CreateUserResponse);
  rpc GetUser (GetUserRequest) returns (GetUserResponse);
}

message CreateUserRequest {
  string customerId = 1;
  string name = 2;
  string email = 3;
  int32 age = 4;
  bool active = 5;
}

message CreateUserResponse {
  string userId = 1;
  bool success = 2;
}

message GetUserRequest {
  string userId = 1;
}

message GetUserResponse {
  string name = 1;
  string email = 2;
}
```

## Custom Rules Example

To generate a GUID for the `customerId` field:
1. Field name: `customerId`
2. Type: `GUID`
3. Value: (leave empty for auto-generation)

## API Endpoints

### POST /api/generate
Generate a Postman collection from a proto file.

**Request:**
- `protoFile`: The .proto file (multipart/form-data)
- `methodName`: Name of the method to generate request for
- `serviceName`: (Optional) Name of the service
- `customRules`: (Optional) JSON string of custom field rules

**Response:**
```json
{
  "postmanCollection": { ... },
  "requestBody": { ... },
  "service": "UserService",
  "method": "CreateUser"
}
```

### POST /api/inspect
Inspect a proto file to list available services and methods.

**Request:**
- `protoFile`: The .proto file (multipart/form-data)

**Response:**
```json
{
  "services": [
    {
      "name": "UserService",
      "methods": [
        {
          "name": "CreateUser",
          "requestType": "CreateUserRequest",
          "responseType": "CreateUserResponse"
        }
      ]
    }
  ]
}
```

## Docker Deployment

The application is containerized and can be deployed using Docker:

```bash
# Build the image
docker build -t proto-json-creator .

# Run the container
docker run -d -p 3000:3000 proto-json-creator
```

## GitHub Container Registry

When pushed to GitHub, the Docker image is automatically built and published to GitHub Container Registry via GitHub Actions.

To pull and run the published image:
```bash
docker pull ghcr.io/midhungopi/protojsonrequestcreater:latest
docker run -p 3000:3000 ghcr.io/midhungopi/protojsonrequestcreater:latest
```

## Technologies Used

- **Backend**: Node.js, Express
- **Proto Parsing**: protobufjs
- **File Upload**: Multer
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Containerization**: Docker
- **CI/CD**: GitHub Actions

## License

MIT
