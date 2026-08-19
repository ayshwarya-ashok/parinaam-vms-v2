import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
    Patch,
  Post,
} from '@nestjs/common';
import { UuidPipe } from '../../common/pipes/uuid.pipe';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { Roles } from '../../common/decorators/auth.decorators';
import { Coordinator } from '../../database/entities';

class CoordinatorDto {
  @IsString() @MaxLength(150) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string;
}

class UpdateCoordinatorDto {
  @IsOptional() @IsString() @MaxLength(150) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string;
}

@ApiTags('coordinators')
@Roles('admin')
@Controller('coordinators')
export class CoordinatorsController {
  constructor(
    @InjectRepository(Coordinator) private readonly repo: Repository<Coordinator>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Coordinator directory' })
  list() {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  @Post()
  @ApiOperation({ summary: 'Add a coordinator' })
  create(@Body() dto: CoordinatorDto) {
    return this.repo.save(this.repo.create(dto));
  }

  @Patch(':id')
  async update(@Param('id', UuidPipe) id: string, @Body() dto: UpdateCoordinatorDto) {
    await this.repo.update({ id }, dto);
    return this.repo.findOneByOrFail({ id });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate — events reference coordinators with RESTRICT' })
  async deactivate(@Param('id', UuidPipe) id: string) {
    await this.repo.update({ id }, { isActive: false });
    return { deactivated: true };
  }
}
