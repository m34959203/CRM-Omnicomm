const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role_code, name: user.full_name }, SECRET, { expiresIn: "12h" });
}

// Проверка JWT
function authRequired(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Требуется авторизация" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Недействительный токен" });
  }
}

// Ограничение по ролям
function roleRequired(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Недостаточно прав" });
    next();
  };
}

module.exports = { sign, authRequired, roleRequired, SECRET };
