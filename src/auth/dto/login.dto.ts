import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class TokenResponseDto {
  accessToken!: string;
  tokenType!: 'Bearer';
  /** Seconds until the token expires */
  expiresIn!: number;
}
