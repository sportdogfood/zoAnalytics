// server.js
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config(); // For local development

const app = express();

// Environment Variables
const zohoRefreshToken = process.env.ZOHO_REFRESH_TOKEN;
const clientId = process.env.ZOHO_CLIENT_ID;
const clientSecret = process.env.ZOHO_CLIENT_SECRET;

// Ensure that environment variables are properly set
if (!zohoRefreshToken || !clientId || !clientSecret) {
  console.error('Missing one or more required environment variables: ZOHO_REFRESH_TOKEN, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET');
  process.exit(1);
}

let zohoAccessToken = '';

// CORS Configuration
const allowedOrigins = ['https://www.sportdogfood.com']; // Add other trusted origins if necessary

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'fx-customer'], // Include all necessary headers
  credentials: true, // Set to true if frontend needs to send cookies or other credentials
  optionsSuccessStatus: 204 // Some legacy browsers choke on 204
};

// Apply Security Middlewares
app.use(helmet());

// Apply Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use(limiter);

// Apply Logging Middleware
app.use(morgan('combined'));

// Apply CORS middleware first
app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced Logging Middleware (Optional)
app.use((req, res, next) => {
  console.log(`Incoming Request: ${req.method} ${req.url}`);
  console.log(`Origin: ${req.headers.origin || 'No Origin'}`);
  console.log(`Access-Control-Request-Method: ${req.headers['access-control-request-method'] || 'N/A'}`);
  console.log(`Access-Control-Request-Headers: ${req.headers['access-control-request-headers'] || 'N/A'}`);
  next();
});

// Function to refresh the Zoho access token
async function refreshZohoToken() {
  const refreshUrl = 'https://accounts.zoho.com/oauth/v2/token';

  try {
    console.log('Attempting to refresh Zoho access token...');
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: zohoRefreshToken,
        client_id: clientId,
        client_secret: clientSecret
      })
    });

    console.log('Refresh token response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);

    if (data.access_token) {
      zohoAccessToken = data.access_token;
      console.log('Zoho Access Token Refreshed:', zohoAccessToken);
      return zohoAccessToken;
    } else {
      throw new Error('Failed to refresh Zoho token: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error refreshing Zoho access token:', error);
    throw error;
  }
}

// Middleware to ensure the Zoho access token is refreshed before calling any route
async function ensureZohoAccessToken(req, res, next) {
  try {
    if (!zohoAccessToken) {
      console.log('No access token found, attempting to refresh...');
      await refreshZohoToken();
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Unable to refresh Zoho access token' });
  }
}

// Helper function to handle Zoho Analytics API requests and token refresh
async function handleZohoApiRequest(apiUrl, res, method = 'GET', body = null) {
  try {
    const options = {
      method: method,
      headers: {
        'Authorization': `Zoho-oauthtoken ${zohoAccessToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    console.log(`Sending Zoho API request to URL: ${apiUrl}`);
    console.log('Request options:', options);

    let response = await fetch(apiUrl, options);

    // Log response status
    console.log('Initial response status:', response.status);

    // If the token is expired (401), refresh it and retry the request
    if (response.status === 401) {
      console.log('Access token expired, refreshing...');
      await refreshZohoToken();

      // Retry the Zoho API request with the new token
      options.headers.Authorization = `Zoho-oauthtoken ${zohoAccessToken}`;
      console.log('Retrying Zoho API request with refreshed token...');
      response = await fetch(apiUrl, options);

      // Log response status after retrying
      console.log('Retry response status:', response.status);
    }

    // If response is still not OK, handle the error
    if (!response.ok) {
      const errorResponse = await response.json();
      console.error(`Zoho API Error: ${response.statusText}`, errorResponse);
      throw new Error(`Zoho API Error: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Zoho API request successful, response data:', data);
    res.json(data);
  } catch (error) {
    console.error("Error fetching Zoho data:", error);
    res.status(500).json({ error: 'Error fetching Zoho data' });
  }
}

// Routes

/**
 * @route   POST /zoho-analytics/report
 * @desc    Fetch data from a Zoho Analytics report
 * @access  Public (CORS controlled)
 */
app.post('/zoho-analytics/report', ensureZohoAccessToken, async (req, res) => {
  const { workspaceId, viewId } = req.body; // Destructure for clarity

  // Validate that both workspaceId and viewId are provided
  if (!workspaceId || !viewId) {
    return res.status(400).json({ error: 'Missing workspaceId or viewId in request.' });
  }

  // Construct the correct API URL
  const apiUrl = `https://analyticsapi.zoho.com/restapi/v2/workspaces/${encodeURIComponent(workspaceId)}/views/${encodeURIComponent(viewId)}`;

  // Use GET instead of POST as per the API requirement
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

/**
 * @route   GET /zoho-analytics/dashboard
 * @desc    Fetch dashboard data from Zoho Analytics
 * @access  Public (CORS controlled)
 */
app.get('/zoho-analytics/dashboard', ensureZohoAccessToken, async (req, res) => {
  const dashboardId = req.query.dashboardId; // Provide the dashboard ID as a query param

  if (!dashboardId) {
    return res.status(400).json({ error: 'Missing dashboardId in request.' });
  }

  const apiUrl = `https://analyticsapi.zoho.com/restapi/v2/dashboards/${encodeURIComponent(dashboardId)}`;
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Additional Routes (if any) can be added here following the same pattern

// Error Handling Middleware (Should be the last middleware)
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Zoho Analytics Server is running on port ${PORT}`);
});
