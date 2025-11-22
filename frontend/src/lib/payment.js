
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // set CORS header
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // deal with OPTIONS pre-check request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // only allow POST request
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { amount } = JSON.parse(event.body);

    // verify amount (Stripe expects at least 50 cents)
    if (!amount || amount < 50) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'The amount has to be more than 0.50' }),
      };
    }

    const origin =
      event.headers.origin ||
      (event.headers.referer && new URL(event.headers.referer).origin) ||
      `https://${event.headers.host}`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: 'nzd',
      automatic_payment_methods: {
        enabled: true,
      },
      description: 'user donation',
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        clientSecret: paymentIntent.client_secret,
      }),
    };
  } catch (error) {
    console.error('Stripe Error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
