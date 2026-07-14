import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../entities/customer.entity';
import { CustomerAddress } from '../entities/customer-address.entity';
import { assertCustomerOwned } from '../customers/customer-ownership.util';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import type { CustomerAddressDto } from '@temp-nx/api-types/crm';

@Injectable()
export class CustomerAddressesService {
  constructor(
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerAddress) private readonly addressRepo: Repository<CustomerAddress>,
  ) {}

  async findAll(storeId: string, customerId: string): Promise<CustomerAddressDto[]> {
    await assertCustomerOwned(this.customerRepo, storeId, customerId);
    return this.addressRepo.find({ where: { customerId }, order: { createdAt: 'ASC' } });
  }

  private async findOwnedAddress(
    storeId: string,
    customerId: string,
    addressId: string,
  ): Promise<CustomerAddress> {
    await assertCustomerOwned(this.customerRepo, storeId, customerId);
    const address = await this.addressRepo.findOne({ where: { id: addressId, customerId } });
    if (!address) {
      throw new NotFoundException(`Address ${addressId} not found on customer ${customerId}`);
    }
    return address;
  }

  async findOne(storeId: string, customerId: string, addressId: string): Promise<CustomerAddressDto> {
    return this.findOwnedAddress(storeId, customerId, addressId);
  }

  async create(storeId: string, customerId: string, dto: CreateAddressDto): Promise<CustomerAddressDto> {
    await assertCustomerOwned(this.customerRepo, storeId, customerId);
    const address = this.addressRepo.create({ ...dto, customerId });
    return this.addressRepo.save(address);
  }

  async update(
    storeId: string,
    customerId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ): Promise<CustomerAddressDto> {
    const address = await this.findOwnedAddress(storeId, customerId, addressId);
    this.addressRepo.merge(address, dto);
    return this.addressRepo.save(address);
  }

  async remove(storeId: string, customerId: string, addressId: string): Promise<void> {
    const address = await this.findOwnedAddress(storeId, customerId, addressId);
    await this.addressRepo.remove(address);
  }
}
