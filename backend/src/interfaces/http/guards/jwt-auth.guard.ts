// JWT Auth Guard
// Layer: Interface — bảo vệ route, kiểm tra token

import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err ?? new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }
    return user;
  }
}
