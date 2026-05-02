// 1. Force Node to use IPv4 first
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const Medusa = require("@medusajs/js-sdk").default;

const sdk = new Medusa({
  baseUrl: "http://127.0.0.1:9000", 
  auth: {
    type: "jwt",
  },
});

// 2. Provide your token (Found in Dashboard > Network tab > Authorization header)
sdk.client.setToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3Rvcl9pZCI6InVzZXJfMDFLTU45NE1CV1JXNVJFVjUzUThISko0N1oiLCJhY3Rvcl90eXBlIjoidXNlciIsImF1dGhfaWRlbnRpdHlfaWQiOiJhdXRoaWRfMDFLTU45NE00Tjc4ODc5SDUzQUtXTUZWTlEiLCJhcHBfbWV0YWRhdGEiOnsidXNlcl9pZCI6InVzZXJfMDFLTU45NE1CV1JXNVJFVjUzUThISko0N1oiLCJyb2xlcyI6W119LCJ1c2VyX21ldGFkYXRhIjp7fSwiaWF0IjoxNzc3NDQ4NjkzLCJleHAiOjE3Nzc1MzUwOTN9.fnp53cNNo7vWdmqy5apAxjiq36yZQw6Mcfs8zvidGJs");

// 3. Test the connection
async function getOrders() {
  try {
    const { orders, count } = await sdk.admin.order.list();
    console.log("Total orders:", count);
    console.log("Orders:", orders);
  } catch (err) {
    console.error("Connection Error Details:", err);
  }
}

getOrders();