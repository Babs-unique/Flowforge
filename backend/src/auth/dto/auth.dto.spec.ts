import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto.js';
import { RegisterDto } from './register.dto.js';

describe('authentication DTOs', () => {
  it('normalizes email and validates registration input', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: '  FLOW@EXAMPLE.COM ',
      password: 'a sufficiently long password',
      name: ' Flow User ',
    });

    expect(dto.email).toBe('flow@example.com');
    expect(dto.name).toBe('Flow User');
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects short passwords and unrecognized fields', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'flow@example.com',
      password: 'short',
      isAdmin: true,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['password', 'isAdmin']),
    );
  });

  it('keeps login password content unchanged while normalizing email', async () => {
    const dto = plainToInstance(LoginDto, {
      email: ' FLOW@EXAMPLE.COM ',
      password: '  exact password  ',
    });

    expect(dto.email).toBe('flow@example.com');
    expect(dto.password).toBe('  exact password  ');
    await expect(validate(dto)).resolves.toHaveLength(0);
  });
});
