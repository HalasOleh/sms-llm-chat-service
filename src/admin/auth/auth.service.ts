import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';

import { AppConfigService } from '../../config/app-config.service';

export interface AdminTokenPayload {
  sub: string;
  role: 'admin';
}

/**
 * Admin authentication.
 *
 * A single configured account is a deliberate simplification within this
 * scope (admin management is out of scope). The password is still stored as a
 * bcrypt hash rather than plaintext: .env ends up in backups, deploy logs and
 * other people's screenshots, and a plaintext password there is a standard
 * finding in a security review.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly config: AppConfigService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string): Promise<string> {
    const admin = this.config.admin;

    // The hash is always compared, even when the username did not match:
    // otherwise the difference in response time tells an attacker that they
    // guessed the username.
    const passwordMatches = await compare(password, admin.passwordHash);

    if (username !== admin.username || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: AdminTokenPayload = { sub: admin.username, role: 'admin' };

    return this.jwt.signAsync(payload);
  }
}
