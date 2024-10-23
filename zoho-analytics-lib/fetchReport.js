const ZohoAnalytics = require('zoho-analytics-sdk');

// Initialize the ZohoAnalytics client with credentials
const zohoAnalytics = new ZohoAnalytics({
  client_id: process.env.ZOHO_CLIENT_ID,
  client_secret: process.env.ZOHO_CLIENT_SECRET,
  refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  redirect_uri: process.env.ZOHO_REDIRECT_URI
});

async function getReport(workspaceId, viewId) {
  try {
    const response = await zohoAnalytics.reports.get(workspaceId, viewId);
    console.log('Report Data:', response);
  } catch (error) {
    console.error('Error fetching report:', error);
  }
}

// Replace these with your actual workspace and view IDs
const workspaceId = 'YOUR_WORKSPACE_ID';
const viewId = 'YOUR_VIEW_ID';

getReport(workspaceId, viewId);
