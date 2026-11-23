import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Installation,
  InstallationDocument,
  SINGLETON_INSTALLATION_KEY,
} from './schemas/installation.schema';

@Injectable()
export class InstallationService {
  private readonly logger = new Logger(InstallationService.name);

  constructor(
    @InjectModel(Installation.name)
    private readonly installationModel: Model<InstallationDocument>,
  ) {}

  async getOrCreateInstallationState(): Promise<InstallationDocument> {
    let state = await this.installationModel
      .findOne({ key: SINGLETON_INSTALLATION_KEY })
      .exec();

    if (!state) {
      try {
        state = await this.installationModel.create({
          key: SINGLETON_INSTALLATION_KEY,
          isInitialized: false,
          initializedAt: null,
          version: '1.0.0',
        });
        this.logger.log('Initialized single installation state record in database');
      } catch (err: any) {
        // Handle race condition if two calls happen simultaneously
        if (err.code === 11000) {
          state = await this.installationModel
            .findOne({ key: SINGLETON_INSTALLATION_KEY })
            .exec();
        } else {
          throw err;
        }
      }
    }

    return state!;
  }

  async isInitialized(): Promise<boolean> {
    const state = await this.getOrCreateInstallationState();
    return state.isInitialized;
  }

  async markAsInitialized(version = '1.0.0'): Promise<InstallationDocument> {
    const state = await this.getOrCreateInstallationState();
    state.isInitialized = true;
    state.initializedAt = new Date();
    state.version = version;
    return state.save();
  }
}
