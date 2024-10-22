const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();

let zohoAccessToken = '';
let zohoRefreshToken = process.env.ZOHO_REFRESH_TOKEN; // Stored in Heroku environment
let clientId = process.env.ZOHO_CLIENT_ID;
let clientSecret = process.env.ZOHO_CLIENT_SECRET;

// Middleware to enable CORS for all requests
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Function to refresh the Zoho access token
async function refreshZohoToken() {
  const refreshUrl = 'https://accounts.zoho.com/oauth/v2/token';

  try {
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

    const data = await response.json();
    if (data.access_token) {
      zohoAccessToken = data.access_token;
      console.log('Zoho Access Token Refreshed:', zohoAccessToken);
      return zohoAccessToken;
    } else {
      throw new Error('Failed to refresh Zoho token');
    }
  } catch (error) {
    console.error('Error refreshing Zoho access token:', error);
    throw error;
  }
}

// Helper function to handle Zoho Analytics API requests and token refresh
async function handleZohoApiRequest(apiUrl, res, method = 'GET', body = null) {
  try {
    let options = {
      method: method,
      headers: { 'Authorization': `Zoho-oauthtoken ${zohoAccessToken}`, 'Content-Type': 'application/json' }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    let response = await fetch(apiUrl, options);

    // If the token is expired (401), refresh it and retry the request
    if (response.status === 401) {
      console.log('Access token expired, refreshing...');
      await refreshZohoToken();

      // Retry the Zoho API request with the new token
      options.headers.Authorization = `Zoho-oauthtoken ${zohoAccessToken}`;
      response = await fetch(apiUrl, options);
    }

    if (!response.ok) {
      const errorResponse = await response.json();
      console.error(`Zoho API Error: ${response.statusText}`, errorResponse);
      throw new Error(`Zoho API Error: ${response.statusText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error fetching Zoho data:", error);
    res.status(500).json({ error: 'Error fetching Zoho data' });
  }
}

// Example route to fetch data from a Zoho Analytics report
app.get('/zoho-analytics/report', async (req, res) => {
    const workspaceId = req.query.workspaceId; // Provide the workspace ID as a query param
    const viewId = req.query.viewId; // Provide the view ID as a query param
  
    // Construct the correct API URL
    const apiUrl = `https://analyticsapi.zoho.com/restapi/v2/workspaces/${workspaceId}/views/${viewId}`;
  
    // Call helper function to make Zoho API request
    await handleZohoApiRequest(apiUrl, res);
  });
  

// Example route to fetch dashboard data from Zoho Analytics
app.get('/zoho-analytics/dashboard', async (req, res) => {
  const dashboardId = req.query.dashboardId; // Provide the dashboard ID as a query param
  const apiUrl = `https://analyticsapi.zoho.com/restapi/v2/dashboards/${dashboardId}`;

  await handleZohoApiRequest(apiUrl, res);
});

// Server listening
app.listen(process.env.PORT || 3000, () => {
  console.log('Server is running...');
});
