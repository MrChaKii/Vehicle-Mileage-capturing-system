const crypto = require('crypto');

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

const getSecret = () => process.env.AUTH_TOKEN_SECRET || 'dev-only-change-this-auth-secret';

const encode = (value) => Buffer
  .from(JSON.stringify(value))
  .toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const decode = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
};

const sign = (input) => crypto
  .createHmac('sha256', getSecret())
  .update(input)
  .digest('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const createToken = (user) => {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const now = Date.now();
  const payload = encode({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    iat: now,
    exp: now + TOKEN_TTL_MS
  });
  const unsigned = `${header}.${payload}`;

  return `${unsigned}.${sign(unsigned)}`;
};

const verifyToken = (token) => {
  const parts = token.split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid token');
  }

  const [header, payload, signature] = parts;
  const expectedSignature = sign(`${header}.${payload}`);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('Invalid token signature');
  }

  const decoded = decode(payload);

  if (!decoded.exp || Date.now() > decoded.exp) {
    throw new Error('Token expired');
  }

  return decoded;
};

module.exports = {
  createToken,
  verifyToken
};
