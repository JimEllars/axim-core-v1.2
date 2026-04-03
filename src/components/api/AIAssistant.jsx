import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as FiIcons from 'react-icons/fi';
import SafeIcon from '../../common/SafeIcon';
import onyxAI from '../../services/onyxAI';

const { 
  FiCpu, FiSend, FiMic, FiMicOff, FiCode, FiZap, 
  FiDatabase, FiGlobe, FiSettings, FiHelpCircle 
} = FiIcons;

const AIAssistant = ({ integrations, onIntegrationUpdate }) => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'system',
      content: '🤖 API Integration Assistant Ready\n\nI can help you:\n• Set up new API integrations\n• Debug connection issues\n• Generate API documentation\n• Suggest integration improvements\n• Write webhook handlers\n\nWhat would you like to work on today?',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Generate contextual suggestions based on integrations
    const newSuggestions = [];
    
    if (integrations.length === 0) {
      newSuggestions.push(
        "Help me set up my first API integration",
        "What types of APIs can I connect?",
        "How do I get API keys for popular services?"
      );
    } else {
      newSuggestions.push(
        "Debug my failing API calls",
        "Generate webhook handler code",
        "Optimize my integration performance",
        "Add authentication to my API"
      );
    }
    
    setSuggestions(newSuggestions);
  }, [integrations]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsProcessing(true);

    try {
      // Enhanced AI routing for API-specific commands
      const response = await routeAPICommand(inputValue.trim());
      
      const aiMessage = {
        id: Date.now() + 1,
        type: 'assistant',
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 1,
        type: 'error',
        content: `🚨 Assistant error: ${error.message}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  const routeAPICommand = async (command) => {
    const cmd = command.toLowerCase();

    // API Integration specific commands
    if (cmd.includes('setup') || cmd.includes('configure') || cmd.includes('connect')) {
      return generateSetupGuide(command);
    } else if (cmd.includes('debug') || cmd.includes('error') || cmd.includes('failing')) {
      return generateDebuggingHelp(command);
    } else if (cmd.includes('code') || cmd.includes('webhook') || cmd.includes('handler')) {
      return generateCodeExample(command);
    } else if (cmd.includes('documentation') || cmd.includes('docs')) {
      return generateDocumentation(command);
    } else if (cmd.includes('optimize') || cmd.includes('performance') || cmd.includes('improve')) {
      return generateOptimizationTips(command);
    } else if (cmd.includes('auth') || cmd.includes('authentication') || cmd.includes('security')) {
      return generateAuthGuide(command);
    } else {
      // Fallback to general Onyx AI
      const result = await onyxAI.routeCommand(command);
      return result.content || result;
    }
  };

  const generateSetupGuide = (command) => {
    return `🔧 **API Integration Setup Guide**

Based on your request, here's a step-by-step setup process:

**1. Choose Your Integration Type:**
• **Webhook**: For real-time notifications (Slack, Discord, Zapier)
• **REST API**: For data exchange (CRM, Analytics, Social Media)
• **Authentication**: API Key, OAuth 2.0, or Bearer Token

**2. Gather Required Information:**
• Base URL (e.g., https://api.service.com)
• API Key or authentication credentials
• Endpoint documentation
• Rate limits and usage policies

**3. Test Your Connection:**
• Start with a simple GET request
• Verify authentication is working
• Check response format and status codes

**4. Common Setup Examples:**

**Slack Webhook:**
\`\`\`
URL: https://hooks.slack.com/services/YOUR/WEBHOOK/URL
Method: POST
Headers: Content-Type: application/json
\`\`\`

**HubSpot API:**
\`\`\`
URL: https://api.hubapi.com
Auth: Bearer YOUR_ACCESS_TOKEN
Endpoints: /crm/v3/objects/contacts
\`\`\`

Would you like me to help you set up a specific integration? Just tell me which service you want to connect!`;
  };

  const generateDebuggingHelp = (command) => {
    return `🔍 **API Debugging Assistant**

Let's troubleshoot your API issues systematically:

**Common Issues & Solutions:**

**🔑 Authentication Errors (401/403):**
• Verify API key is correct and active
• Check if key has required permissions
• Ensure proper header format: \`Authorization: Bearer TOKEN\`

**🌐 Connection Issues (Network Errors):**
• Verify base URL is correct
• Check if service is operational (status page)
• Test with curl or Postman first

**📊 Rate Limiting (429):**
• Reduce request frequency
• Implement exponential backoff
• Check rate limit headers in response

**📝 Data Format Issues (400):**
• Validate JSON payload structure
• Check required vs optional fields
• Ensure proper content-type headers

**🔧 Debugging Steps:**
1. **Check API Logs** - Look for error patterns
2. **Test Manually** - Use Postman or curl
3. **Validate Credentials** - Re-generate if needed
4. **Review Documentation** - Check for API changes

**Quick Test Commands:**
\`\`\`bash
# Test connection
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.service.com/test

# Check headers
curl -I https://api.service.com/endpoint
\`\`\`

What specific error are you encountering? Share the error message and I'll provide targeted help!`;
  };

  const generateCodeExample = (command) => {
    return `💻 **Code Generator - Webhook Handler**

Here are production-ready code examples:

**Express.js Webhook Handler:**
\`\`\`javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

app.use(express.json());

// Webhook endpoint
app.post('/webhook', (req, res) => {
  try {
    // Verify webhook signature (optional but recommended)
    const signature = req.headers['x-signature'];
    const payload = JSON.stringify(req.body);
    
    // Process the webhook data
    const { event, data } = req.body;
    
    switch(event) {
      case 'contact.created':
        handleNewContact(data);
        break;
      case 'payment.completed':
        handlePayment(data);
        break;
      default:
        console.log('Unknown event:', event);
    }
    
    res.status(200).json({ status: 'received' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Processing failed' });
  }
});

function handleNewContact(contactData) {
  // Add to your CRM or database
  console.log('New contact:', contactData);
  // Your business logic here
}

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});
\`\`\`

**Python Flask Handler:**
\`\`\`python
from flask import Flask, request, jsonify
import hmac
import hashlib

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def handle_webhook():
    try:
        payload = request.get_json()
        
        # Verify signature if needed
        # signature = request.headers.get('X-Signature')
        
        event_type = payload.get('event')
        data = payload.get('data')
        
        if event_type == 'contact.created':
            process_new_contact(data)
        elif event_type == 'order.completed':
            process_order(data)
            
        return jsonify({'status': 'success'}), 200
        
    except Exception as e:
        print(f"Webhook error: {e}")
        return jsonify({'error': str(e)}), 500

def process_new_contact(contact_data):
    # Your processing logic
    print(f"Processing contact: {contact_data}")

if __name__ == '__main__':
    app.run(debug=True, port=5000)
\`\`\`

**React Integration Component:**
\`\`\`jsx
import React, { useState, useEffect } from 'react';

const APIIntegration = () => {
  const [status, setStatus] = useState('idle');
  const [data, setData] = useState(null);

  const callAPI = async (endpoint, payload) => {
    setStatus('loading');
    try {
      const response = await fetch(\`https://api.service.com/\${endpoint}\`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer YOUR_TOKEN',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}\`);
      }
      
      const result = await response.json();
      setData(result);
      setStatus('success');
    } catch (error) {
      console.error('API Error:', error);
      setStatus('error');
    }
  };

  return (
    <div>
      <button onClick={() => callAPI('contacts', { name: 'John' })}>
        Create Contact
      </button>
      <div>Status: {status}</div>
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
};
\`\`\`

Need code for a specific integration? Just ask!`;
  };

  const generateDocumentation = (command) => {
    return `📚 **API Documentation Generator**

Here's a comprehensive documentation template:

**Integration Overview:**
• **Service**: [Service Name]
• **Purpose**: [What this integration does]
• **Auth Method**: [API Key/OAuth/Bearer Token]
• **Rate Limits**: [Requests per hour/minute]

**Authentication:**
\`\`\`
Headers:
  Authorization: Bearer YOUR_ACCESS_TOKEN
  Content-Type: application/json
\`\`\`

**Available Endpoints:**

**1. Create Contact**
\`\`\`
POST /api/v1/contacts
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890"
}

Response (201):
{
  "id": "contact_123",
  "status": "created",
  "timestamp": "2024-01-15T10:30:00Z"
}
\`\`\`

**2. Get Contacts**
\`\`\`
GET /api/v1/contacts?limit=50&offset=0

Response (200):
{
  "contacts": [...],
  "total": 150,
  "page": 1
}
\`\`\`

**Error Handling:**
\`\`\`
400 Bad Request - Invalid payload
401 Unauthorized - Invalid/expired token
429 Too Many Requests - Rate limit exceeded
500 Internal Error - Server issue
\`\`\`

**Webhook Events:**
• \`contact.created\` - New contact added
• \`contact.updated\` - Contact modified
• \`contact.deleted\` - Contact removed

**Testing:**
\`\`\`bash
# Test authentication
curl -H "Authorization: Bearer TOKEN" https://api.service.com/test

# Create contact
curl -X POST https://api.service.com/contacts \\
  -H "Authorization: Bearer TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Test User","email":"test@example.com"}'
\`\`\`

**SDKs & Libraries:**
• JavaScript: \`npm install service-api-sdk\`
• Python: \`pip install service-api\`
• PHP: \`composer require service/api-client\`

Need documentation for your specific API? Share the details!`;
  };

  const generateOptimizationTips = (command) => {
    return `⚡ **API Performance Optimization**

**Current Integration Analysis:**
${integrations.length > 0 ? `You have ${integrations.length} active integrations` : 'No integrations detected yet'}

**Optimization Strategies:**

**🚀 Performance Improvements:**

**1. Caching Strategy:**
\`\`\`javascript
// Redis caching example
const redis = require('redis');
const client = redis.createClient();

async function getCachedData(key) {
  const cached = await client.get(key);
  if (cached) return JSON.parse(cached);
  
  // Fetch fresh data
  const data = await apiCall();
  await client.setex(key, 300, JSON.stringify(data)); // Cache for 5 min
  return data;
}
\`\`\`

**2. Batch Processing:**
\`\`\`javascript
// Process multiple items in batches
async function batchProcess(items, batchSize = 10) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(processItem));
    
    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
\`\`\`

**3. Connection Pooling:**
\`\`\`javascript
const https = require('https');

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  timeout: 30000
});

// Reuse connections
fetch(url, { agent });
\`\`\`

**📊 Monitoring & Metrics:**

**Key Metrics to Track:**
• Response time (aim for <500ms)
• Success rate (target 99.9%)
• Rate limit usage (stay under 80%)
• Error patterns and frequency

**Monitoring Code:**
\`\`\`javascript
class APIMonitor {
  constructor() {
    this.metrics = {
      calls: 0,
      errors: 0,
      totalTime: 0
    };
  }
  
  async trackCall(apiFunction) {
    const start = Date.now();
    this.metrics.calls++;
    
    try {
      const result = await apiFunction();
      this.metrics.totalTime += Date.now() - start;
      return result;
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }
  
  getStats() {
    return {
      avgResponseTime: this.metrics.totalTime / this.metrics.calls,
      errorRate: (this.metrics.errors / this.metrics.calls) * 100,
      totalCalls: this.metrics.calls
    };
  }
}
\`\`\`

**🔄 Rate Limit Handling:**
\`\`\`javascript
class RateLimiter {
  constructor(maxRequests = 100, windowMs = 3600000) {
    this.requests = [];
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }
  
  async waitIfNeeded() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.requests.push(now);
  }
}
\`\`\`

**🛡️ Error Recovery:**
\`\`\`javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = Math.pow(2, i) * 1000; // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
\`\`\`

**Recommended Next Steps:**
1. Implement response time monitoring
2. Add retry logic with exponential backoff  
3. Set up caching for frequently accessed data
4. Monitor rate limit usage
5. Create health check endpoints

Which optimization would you like to implement first?`;
  };

  const generateAuthGuide = (command) => {
    return `🔐 **API Authentication & Security Guide**

**Authentication Methods:**

**1. API Key Authentication:**
\`\`\`javascript
// Header-based
headers: {
  'X-API-Key': 'your-api-key-here',
  'Content-Type': 'application/json'
}

// Query parameter (less secure)
const url = 'https://api.service.com/data?api_key=YOUR_KEY';
\`\`\`

**2. Bearer Token (JWT):**
\`\`\`javascript
headers: {
  'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIs...',
  'Content-Type': 'application/json'
}
\`\`\`

**3. OAuth 2.0 Flow:**
\`\`\`javascript
// Step 1: Authorization URL
const authUrl = 'https://api.service.com/oauth/authorize?' +
  'client_id=YOUR_CLIENT_ID&' +
  'redirect_uri=YOUR_REDIRECT_URI&' +
  'response_type=code&' +
  'scope=read write';

// Step 2: Exchange code for token
const tokenResponse = await fetch('https://api.service.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    code: 'AUTHORIZATION_CODE',
    redirect_uri: 'YOUR_REDIRECT_URI'
  })
});
\`\`\`

**4. Basic Authentication:**
\`\`\`javascript
const credentials = btoa('username:password');
headers: {
  'Authorization': 'Basic ' + credentials
}
\`\`\`

**🛡️ Security Best Practices:**

**Environment Variables:**
\`\`\`bash
# .env file
API_KEY=your-secret-key
CLIENT_SECRET=your-oauth-secret
WEBHOOK_SECRET=your-webhook-secret
\`\`\`

**Secure Storage:**
\`\`\`javascript
// Never hardcode secrets
const apiKey = process.env.API_KEY;

// Use encryption for stored tokens
const crypto = require('crypto');

function encryptToken(token) {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  // Return IV + AuthTag + encrypted data for storage
  return \`\${iv.toString('hex')}:\${authTag}:\${encrypted}\`;
}

function decryptToken(encryptedData) {
  const algorithm = 'aes-256-gcm';
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
\`\`\`

**Webhook Signature Verification:**
\`\`\`javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
    
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

// Usage in webhook handler
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-signature-256'];
  const payload = JSON.stringify(req.body);
  
  if (!verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Unauthorized');
  }
  
  // Process webhook...
});
\`\`\`

**Token Refresh Logic:**
\`\`\`javascript
class TokenManager {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.expiresAt = null;
  }
  
  async getValidToken() {
    if (this.accessToken && Date.now() < this.expiresAt) {
      return this.accessToken;
    }
    
    return await this.refreshAccessToken();
  }
  
  async refreshAccessToken() {
    const response = await fetch('https://api.service.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET
      })
    });
    
    const data = await response.json();
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in * 1000);
    
    return this.accessToken;
  }
}
\`\`\`

**🔍 Security Checklist:**
✅ Store secrets in environment variables
✅ Use HTTPS for all API calls
✅ Implement token refresh logic
✅ Verify webhook signatures
✅ Log security events
✅ Rotate keys regularly
✅ Implement rate limiting
✅ Validate all inputs

**Common Security Mistakes:**
❌ Hardcoding API keys in source code
❌ Logging sensitive data
❌ Using HTTP instead of HTTPS
❌ Not validating webhook signatures
❌ Storing tokens in localStorage (client-side)

Need help implementing authentication for a specific service?`;
  };

  const quickSuggestions = [
    "Set up Slack webhook integration",
    "Debug 401 authentication error",
    "Generate webhook handler code",
    "Optimize API performance",
    "Add OAuth 2.0 authentication",
    "Create API documentation"
  ];

  const toggleVoiceInput = () => {
    // Check for speech recognition support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      
      if (!isListening) {
        recognition.start();
        setIsListening(true);
        
        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          setInputValue(transcript);
          setIsListening(false);
        };
        
        recognition.onerror = () => {
          setIsListening(false);
        };
        
        recognition.onend = () => {
          setIsListening(false);
        };
      }
    } else {
      alert('Voice recognition not supported in this browser');
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Assistant Chat */}
      <div className="glass-effect rounded-xl h-[60vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-onyx-accent/20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
              <SafeIcon icon={FiCpu} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">API Integration Assistant</h2>
              <p className="text-sm text-slate-400">Specialized help for API setup and management</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 text-green-400 bg-green-900/20 rounded-lg px-3 py-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium">AI Online</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <AnimatePresence>
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-4xl rounded-lg p-4 ${
                  message.type === 'user' 
                    ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100' 
                    : message.type === 'error'
                    ? 'bg-red-900/20 border border-red-800/30 text-red-300'
                    : 'bg-onyx-950/50 border border-onyx-accent/30 text-slate-100'
                }`}>
                  <div className="flex items-start space-x-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.type === 'user' 
                        ? 'bg-blue-600' 
                        : message.type === 'error'
                        ? 'bg-red-600'
                        : 'bg-gradient-to-r from-orange-500 to-red-600'
                    }`}>
                      <SafeIcon 
                        icon={message.type === 'user' ? FiCode : FiCpu} 
                        className="text-white text-sm" 
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium opacity-70">
                          {message.type === 'user' ? 'YOU' : 'API ASSISTANT'}
                        </span>
                        <span className="text-xs opacity-50">
                          {message.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {message.content}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-onyx-950/50 border border-onyx-accent/30 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-600 rounded-full flex items-center justify-center">
                    <SafeIcon icon={FiCpu} className="text-white text-sm animate-pulse" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"
                          style={{ animationDelay: `${i * 0.3}s` }}
                        />
                      ))}
                    </div>
                    <span className="text-slate-300 text-sm">API Assistant thinking...</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="p-6 border-t border-onyx-accent/20">
          <div className="flex space-x-4">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about API integrations, debugging, or code generation..."
                className="w-full bg-onyx-950/50 border border-onyx-accent/20 rounded-lg px-4 py-3 pr-12 text-white placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                disabled={isProcessing}
              />
              <motion.button
                type="button"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleVoiceInput}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded-lg transition-colors ${
                  isListening ? 'text-red-400 animate-pulse' : 'text-slate-400 hover:text-white'
                }`}
                title="Voice input"
              >
                <SafeIcon icon={isListening ? FiMicOff : FiMic} />
              </motion.button>
            </div>
            
            <motion.button
              type="submit"
              disabled={!inputValue.trim() || isProcessing}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-3 rounded-lg font-medium hover:from-orange-700 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              <SafeIcon icon={FiSend} />
            </motion.button>
          </div>
        </form>
      </div>

      {/* Quick Suggestions */}
      <div className="glass-effect rounded-xl p-6">
        <div className="flex items-center space-x-3 mb-4">
          <SafeIcon icon={FiHelpCircle} className="text-blue-400" />
          <h3 className="text-lg font-semibold text-white">Quick Suggestions</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {quickSuggestions.map((suggestion, index) => (
            <motion.button
              key={index}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setInputValue(suggestion)}
              className="text-left p-3 bg-onyx-950/50 hover:bg-onyx-accent/10 rounded-lg border border-onyx-accent/30 hover:border-onyx-accent/50 transition-colors"
            >
              <span className="text-sm text-slate-300">{suggestion}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Integration Context */}
      {integrations.length > 0 && (
        <div className="glass-effect rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Your Current Integrations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.slice(0, 6).map((integration) => (
              <div key={integration.id} className="flex items-center space-x-3 p-3 bg-onyx-950/50 rounded-lg">
                <SafeIcon 
                  icon={integration.type === 'webhook' ? FiZap : 
                       integration.type === 'crm' ? FiDatabase : FiGlobe} 
                  className="text-blue-400" 
                />
                <div>
                  <p className="text-sm font-medium text-white">{integration.name}</p>
                  <p className="text-xs text-slate-400">{integration.type.replace('_', ' ')}</p>
                </div>
                <div className={`w-2 h-2 rounded-full ${
                  integration.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
                }`}></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIAssistant;