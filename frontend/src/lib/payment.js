// payment.js - Node.js + Express backend
const express = require('express');
const cors = require('cors');
//const stripe = require('stripe')('sk_test_your_secret_key_here');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// create paying attempt
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body;
    
    // verify amount
    if (!amount || amount < 50) { // minimum amount on Stripe is 0.5
      return res.status(400).json({ error: 'The amount must be more than 0.50' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency: 'nzd',
      automatic_payment_methods: {
        enabled: true,
      },
      description: 'user donation',
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// verify the payment status
app.get('/payment-status/:paymentIntentId', async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(
      req.params.paymentIntentId
    );
    res.json({ status: paymentIntent.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});