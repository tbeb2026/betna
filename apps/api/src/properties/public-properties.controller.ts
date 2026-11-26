import { Controller, Get, Param, Query } from "@nestjs/common";
import { PublicDiscoveryFilters, SearchService } from "./search.service";

/** Public discovery deliberately has no session guard; SearchService still projects safe fields. */
@Controller("public/properties")
export class PublicPropertiesController {
  constructor(private readonly search: SearchService) {}

  @Get()
  list(@Query() query: PublicDiscoveryFilters) {
    return this.search.search(query);
  }

  @Get(":slug")
  get(@Param("slug") slug: string, @Query("locale") locale?: string) {
    return this.search.findBySlug(slug, locale ?? "en");
  }
}
