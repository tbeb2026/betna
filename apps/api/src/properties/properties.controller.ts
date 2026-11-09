import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  ParseUUIDPipe,
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
    return this.properties.createDraft(request.user.id, body);
  }

  @Get(":id")
  get(@Req() request: { user: { id: string } }, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.properties.getDraft(id, request.user.id);
  }

  @Patch(":id")
  update(
    @Req() request: { user: { id: string } },
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Body() body: UpdatePropertyDto,
  ) {
    return this.properties.updateDraft(id, request.user.id, body);
  }

  @Post(":id/submit")
  submit(@Req() request: { user: { id: string } }, @Param("id", new ParseUUIDPipe({ version: "4" })) id: string) {
    return this.properties.submit(id, request.user.id);
  }
}
