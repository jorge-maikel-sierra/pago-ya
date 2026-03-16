import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import bcrypt from 'bcryptjs';
import * as userService from '../services/user.service.js';

const localStrategy = new LocalStrategy(
  { usernameField: 'email', passwordField: 'password', session: true },
  async (email, password, done) => {
    try {
      const user = await userService.findUserByEmailForAuth(email);

      if (!user) return done(null, false, { message: 'Credenciales inválidas' });

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) return done(null, false, { message: 'Credenciales inválidas' });

      if (!user.isActive) return done(null, false, { message: 'Cuenta desactivada' });

      const allowedRoles = ['SUPER_ADMIN', 'ADMIN'];
      if (!allowedRoles.includes(user.role)) {
        return done(null, false, { message: 'Acceso denegado. Solo administradores' });
      }

      const { passwordHash, ...safeUser } = user;
      return done(null, safeUser);
    } catch (err) {
      return done(err);
    }
  },
);

const jwtStrategy = new JwtStrategy(
  {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET,
  },
  async (payload, done) => {
    try {
      const user = await userService.findActiveUserById(payload.sub);

      if (!user) return done(null, false, { message: 'Usuario no encontrado' });
      if (!user.isActive) return done(null, false, { message: 'Cuenta desactivada' });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  },
);

passport.use(localStrategy);
passport.use(jwtStrategy);

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser(async (id, done) => {
  try {
    const user = await userService.findActiveUserById(id);
    if (!user) return done(null, false);
    return done(null, user);
  } catch (err) {
    return done(err);
  }
});

export default passport;
