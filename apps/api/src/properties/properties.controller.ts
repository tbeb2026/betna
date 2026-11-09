import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthSessionGuard, Roles, RolesGuard } from "../auth/guards";
import { CreatePropertyDto, UpdatePropertyDto } from "./dto";
import { PropertiesService } from "./properties.service";
import { TaxonomyService } from "./taxonomy.service";

@Controller("owner/properties")
@UseGuards(AuthSessionGuard, RolesGuard)
@Roles("OWNER")
export class PropertiesController {
  constructor(
    private readonly properties: PropertiesService,
    private readonly taxonomy: TaxonomyService,
  ) {}

  @Get("taxonomy")
  taxonomyOptions() {
    return this.taxonomy.list();
  }

  @Get("geography")
  geographyOptions() {
    return this.properties.listGeography();
  }

  @Get()
  list(@Req() request: { user: { id: string } }) {
    return this.properties.listForOwner(request.user.id);
  }

  @Post()
  create(
    @Req() request: { user: { id: string } },
    @Body() body: CreatePropertyDto,
  ) {
    assertMutationBody(body);
    return this.properties.createDraft(request.user.id, body);
  }

  @Get(":id")
  get(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    return this.properties.getDraft(id, request.user.id);
  }

  @Patch(":id")
  update(
    @Req() request: { user: { id: string } },
    @Param("id") id: string,
    @Body() body: UpdatePropertyDto,
  ) {
    assertMutationBody(body);
    return this.properties.updateDraft(id, request.user.id, body);
  }

  @Post(":id/submit")
  submit(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    return this.properties.submit(id, request.user.id);
  }
}

function assertMutationBody(body: unknown): asserts body is object {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("Request body must be an object");
  }
  if (containsNull(body)) {
    throw new BadRequestException("Request body contains an invalid null value");
  }
}

function containsNull(value: unknown): boolean {
  if (value === null) return true;
  if (Array.isArray(value)) return value.some(containsNull);
  if (typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(containsNull);
}
