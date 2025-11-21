
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

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'nzd',
            product_data: {
              name: 'User donation',
            },
            unit_amount: Math.round(amount),
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/?payment=success`,
      cancel_url: `${origin}/?payment=cancel`,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        url: session.url,
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
