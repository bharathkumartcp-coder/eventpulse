const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const { signToken } = require('../config/jwt');

/**
 * POST /api/auth/register
 * Register a new organizer
 */
async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    // Check if email already in use
    const { data: existing } = await supabase
      .from('organizers')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const { data: organizer, error } = await supabase
      .from('organizers')
      .insert({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
      })
      .select('id, name, email, created_at')
      .single();

    if (error) {
      console.error('Register error:', error);
      return res.status(500).json({ error: 'Registration failed. Please try again.' });
    }

    const token = signToken({ id: organizer.id, email: organizer.email });

    return res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: { id: organizer.id, name: organizer.name, email: organizer.email },
    });
  } catch (err) {
    console.error('Register exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * POST /api/auth/login
 * Login an organizer, return JWT
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    const { data: organizer, error } = await supabase
      .from('organizers')
      .select('id, name, email, password')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (error || !organizer) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const passwordMatch = await bcrypt.compare(password, organizer.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken({ id: organizer.id, email: organizer.email });

    return res.json({
      message: 'Login successful.',
      token,
      user: { id: organizer.id, name: organizer.name, email: organizer.email },
    });
  } catch (err) {
    console.error('Login exception:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

/**
 * GET /api/auth/me
 * Return current organizer (req.user is set by requireAuth middleware)
 */
async function me(req, res) {
  return res.json({ user: req.user });
}

module.exports = { register, login, me };
