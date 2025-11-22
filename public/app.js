let currentPostmanCollection = null;

// Add new rule row
document.getElementById('addRuleBtn').addEventListener('click', () => {
    const container = document.getElementById('rulesContainer');
    const newRule = document.createElement('div');
    newRule.className = 'rule-row';
    newRule.innerHTML = `
        <input type="text" class="rule-field" placeholder="Field name (e.g., customerId)" />
        <select class="rule-type">
            <option value="string">String</option>
            <option value="int">Integer</option>
            <option value="guid">GUID</option>
        </select>
        <input type="text" class="rule-value" placeholder="Custom value (optional)" />
        <button class="btn-remove" onclick="removeRule(this)">×</button>
    `;
    container.appendChild(newRule);
});

// Remove rule row
function removeRule(button) {
    const container = document.getElementById('rulesContainer');
    if (container.children.length > 1) {
        button.parentElement.remove();
    }
}

// Collect custom rules from the form
function getCustomRules() {
    const rules = {};
    const rows = document.querySelectorAll('.rule-row');
    
    rows.forEach(row => {
        const field = row.querySelector('.rule-field').value.trim();
        const type = row.querySelector('.rule-type').value;
        const value = row.querySelector('.rule-value').value.trim();
        
        if (field) {
            rules[field] = {
                type: type,
                value: value || null
            };
        }
    });
    
    return rules;
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// Show result
function showResult(data) {
    document.getElementById('error').style.display = 'none';
    
    const resultDiv = document.getElementById('result');
    document.getElementById('resultService').textContent = data.service || 'N/A';
    document.getElementById('resultMethod').textContent = data.method || 'N/A';
    
    document.getElementById('postmanOutput').textContent = 
        JSON.stringify(data.postmanCollection, null, 2);
    document.getElementById('bodyOutput').textContent = 
        JSON.stringify(data.requestBody, null, 2);
    
    currentPostmanCollection = data.postmanCollection;
    resultDiv.style.display = 'block';
    resultDiv.scrollIntoView({ behavior: 'smooth' });
}

// Inspect proto file
document.getElementById('inspectBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('protoFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showError('Please select a proto file first');
        return;
    }
    
    const formData = new FormData();
    formData.append('protoFile', file);
    
    try {
        const response = await fetch('/api/inspect', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            showError(data.error || 'Failed to inspect proto file');
            return;
        }
        
        // Display the inspection results
        const resultSection = document.getElementById('inspectResult');
        resultSection.innerHTML = '<h3>Available Services and Methods:</h3>';
        
        if (data.services.length === 0) {
            resultSection.innerHTML += '<p>No services found in proto file.</p>';
        } else {
            data.services.forEach(service => {
                const serviceDiv = document.createElement('div');
                serviceDiv.className = 'service-info';
                serviceDiv.innerHTML = `
                    <h4>Service: ${service.name}</h4>
                    <ul class="method-list">
                        ${service.methods.map(method => 
                            `<li>→ ${method.name} (${method.requestType} → ${method.responseType})</li>`
                        ).join('')}
                    </ul>
                `;
                resultSection.appendChild(serviceDiv);
            });
        }
        
        resultSection.classList.add('show');
        
    } catch (error) {
        showError('Error inspecting proto file: ' + error.message);
    }
});

// Generate Postman request
document.getElementById('generateBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('protoFile');
    const methodName = document.getElementById('methodName').value.trim();
    const serviceName = document.getElementById('serviceName').value.trim();
    
    if (!fileInput.files[0]) {
        showError('Please select a proto file');
        return;
    }
    
    if (!methodName) {
        showError('Please enter a method name');
        return;
    }
    
    const formData = new FormData();
    formData.append('protoFile', fileInput.files[0]);
    formData.append('methodName', methodName);
    
    if (serviceName) {
        formData.append('serviceName', serviceName);
    }
    
    const customRules = getCustomRules();
    formData.append('customRules', JSON.stringify(customRules));
    
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            let errorMsg = data.error || 'Failed to generate request';
            
            if (data.availableServices) {
                errorMsg += '\n\nAvailable services:\n';
                data.availableServices.forEach(service => {
                    errorMsg += `\n${service.name}: ${service.methods.join(', ')}`;
                });
            }
            
            showError(errorMsg);
            return;
        }
        
        showResult(data);
        
    } catch (error) {
        showError('Error generating request: ' + error.message);
    }
});

// Copy Postman collection to clipboard
document.getElementById('copyPostmanBtn').addEventListener('click', () => {
    const output = document.getElementById('postmanOutput').textContent;
    navigator.clipboard.writeText(output).then(() => {
        const btn = document.getElementById('copyPostmanBtn');
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(err => {
        showError('Failed to copy to clipboard');
    });
});

// Download Postman collection
document.getElementById('downloadBtn').addEventListener('click', () => {
    if (!currentPostmanCollection) {
        showError('No collection to download');
        return;
    }
    
    const blob = new Blob(
        [JSON.stringify(currentPostmanCollection, null, 2)], 
        { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentPostmanCollection.info.name || 'postman'}_collection.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update active tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tab}Tab`).classList.add('active');
    });
});
