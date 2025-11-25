// middleware/requireRole.js

const requireRole = (requiredRole) => {
  return (req, res, next) => {
    // This middleware assumes 'requireAuth' has been run before it.
    // 'requireAuth' attaches the user object to req.user.
    const user = req.user;

    if (!user || !user.role) {
      // This case should ideally not be hit if requireAuth is working correctly
      return res.status(401).json({ error: 'Authentication error: User data is missing.' });
    }

    if (user.role !== requiredRole) {
      return res.status(403).json({ error: 'Forbidden: You do not have the required permissions.' });
    }

    // If we're here, the user has the required role.
    next();
  };
};

export default requireRole;
