import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNumber,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type { CountryCode, CurrencyCode, RentalMode } from "@betna/contracts";

export class PropertyLocationDto {
  @IsString()
  @MaxLength(240)
  label!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;
}

export class ExactLocationDto {
  @IsString()
  @MaxLength(500)
  address!: string;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;
}

export class OfferingDto {
  @IsIn(["SHORT_STAY", "LONG_TERM"])
  mode!: RentalMode;

  @IsIn(["KES", "UGX"])
  currency!: CurrencyCode;

  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  basePrice!: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  negotiable?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  minimumNights?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T.*)?$/)
  moveInDate?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  leaseDurationMonths?: number;
}

export class CreatePropertyDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(10_000)
  description!: string;

  @IsIn(["KE", "UG"])
  countryCode!: CountryCode;

  @ValidateIf((_, value) => value !== undefined)
  @IsUUID("4")
  countryId?: string;

  @IsUUID("4")
  cityId!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsUUID("4")
  neighborhoodId?: string;

  @IsString()
  @MaxLength(100)
  category!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  subcategory?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  amenities?: string[];

  @IsDefined()
  @ValidateNested()
  @Type(() => PropertyLocationDto)
  publicLocation!: PropertyLocationDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => ExactLocationDto)
  exactLocation!: ExactLocationDto;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  authorizationAttested?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferingDto)
  offerings!: OfferingDto[];
}

export class UpdatePropertyDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(200)
  title?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(["KE", "UG"])
  countryCode?: CountryCode;

  @ValidateIf((_, value) => value !== undefined)
  @IsUUID("4")
  countryId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsUUID("4")
  cityId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsUUID("4")
  neighborhoodId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  category?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(100)
  subcategory?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  amenities?: string[];

  @ValidateIf((_, value) => value !== undefined)
  @ValidateNested()
  @Type(() => PropertyLocationDto)
  publicLocation?: PropertyLocationDto;

  @ValidateIf((_, value) => value !== undefined)
  @ValidateNested()
  @Type(() => ExactLocationDto)
  exactLocation?: ExactLocationDto;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  authorizationAttested?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfferingDto)
  offerings?: OfferingDto[];
}

export type PropertyLocationInput = PropertyLocationDto;
export type ExactLocationInput = ExactLocationDto;
export type OfferingInput = OfferingDto;
export type CreatePropertyInput = CreatePropertyDto;
export type UpdatePropertyInput = UpdatePropertyDto;
