const jwt = require('jsonwebtoken');
const secret = process.env.TRAINER_SESSION_SECRET;
if (!secret) throw new Error('Missing TRAINER_SESSION_SECRET');
const payload = {
  userId: 'test-admin',
  role: 'admin',
  accountRole: 'admin',
  linkedMemberId: null,
  memberId: null,
  isMember: false,
  accountEmail: 'test@admin.local',
  accountFirstName: 'Test',
  accountLastName: 'Admin',
  exp: Math.floor(Date.now() / 1000) + 3600,
  version: 2
};
const token = jwt.sign(payload, secret);
console.log(token);
