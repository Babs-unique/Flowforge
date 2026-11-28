import { Transform } from 'class-transformer';
import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateOrganizationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MinLength(2)
  @MaxLength(100)
  slug?: string;
}
