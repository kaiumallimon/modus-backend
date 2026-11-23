import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

describe('OrganizationController', () => {
  let controller: OrganizationController;
  let mockOrgService: {
    getSettings: jest.Mock;
    updateSettings: jest.Mock;
  };

  beforeEach(async () => {
    mockOrgService = {
      getSettings: jest.fn().mockResolvedValue({ name: 'Acme Org' }),
      updateSettings: jest.fn().mockResolvedValue({ name: 'Updated Org' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationController],
      providers: [
        {
          provide: OrganizationService,
          useValue: mockOrgService,
        },
      ],
    }).compile();

    controller = module.get<OrganizationController>(OrganizationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return organization profile', async () => {
    const result = await controller.getOrganization();
    expect(result).toEqual({ name: 'Acme Org' });
    expect(mockOrgService.getSettings).toHaveBeenCalled();
  });

  it('should update organization profile', async () => {
    const dto = { name: 'Updated Org' };
    const userPayload: any = { userId: 'u1', email: 'admin@modus.local', role: 'SUPER_ADMIN' };
    const req: any = { ip: '127.0.0.1', headers: { 'user-agent': 'test-agent' } };

    const result = await controller.updateOrganization(dto, userPayload, req);
    expect(result).toEqual({ name: 'Updated Org' });
    expect(mockOrgService.updateSettings).toHaveBeenCalledWith(
      dto,
      { id: 'u1', email: 'admin@modus.local', role: 'SUPER_ADMIN' },
      '127.0.0.1',
      'test-agent',
    );
  });
});
