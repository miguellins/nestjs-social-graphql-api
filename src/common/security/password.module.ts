import { Module } from "@nestjs/common";

import { PasswordService } from "@/common/security/password.service";

@Module({
  providers: [PasswordService],
  exports: [PasswordService],
})
export class PasswordModule {}
