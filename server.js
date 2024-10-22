const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors'); 
const app = express();

let zohoAccessToken = '';
const zohoRefreshToken = process.env.ZOHO_REFRESH_TOKEN; // Stored in Heroku environment
const clientId = process.env.ZOHO_CLIENT_ID;
const clientSecret = process.env.ZOHO_CLIENT_SECRET;

// Middleware to enable CORS for all requests
const corsOptions = {
    origin: 'https://www.sportdogfood.com',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure that environment variables are properly set
if (!zohoRefreshToken || !clientId || !clientSecret) {
  console.error('Missing one or more required environment variables: ZOHO_REFRESH_TOKEN, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET');
  process.exit(1);
}

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
    let options = {
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

    // Log response if it's not successful
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

// Example route to fetch data from a Zoho Analytics report
app.post('/zoho-analytics/report', ensureZohoAccessToken, async (req, res) => {
  const workspaceId = req.body.workspaceId; // Get the workspace ID from the request body
  const viewId = req.body.viewId; // Get the view ID from the request body

  // Validate that both workspaceId and viewId are provided
  if (!workspaceId || !viewId) {
    return res.status(400).json({ error: 'Missing workspaceId or viewId in request.' });
  }

  // Construct the correct API URL
  const apiUrl = `https://analyticsapi.zoho.com/restapi/v2/workspaces/${workspaceId}/views/${viewId}`;

  // Use GET instead of POST as per the API requirement
  await handleZohoApiRequest(apiUrl, res, 'GET');
});

// Example route to fetch dashboard data from Zoho Analytics
app.get('/zoho-analytics/dashboard', ensureZohoAccessToken, async (req, res) => {
  const dashboardId = req.query.dashboardId; // Provide the dashboard ID as a query param

  if (!dashboardId) {
    return res.status(400).json({ error: 'Missing dashboardId in request.' });
  }

  const apiUrl = `https://analyticsapi.zoho.com/restapi/v2/dashboards/${dashboardId}`;
  await handleZohoApiRequest(apiUrl, res);
});

// Server listening
app.listen(process.env.PORT || 3000, () => {
  console.log('Server is running...');
});

