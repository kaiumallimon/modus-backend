import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Role } from './enums/role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async create(data: Partial<User>): Promise<UserDocument> {
    const user = new this.userModel(data);
    return user.save();
  }

  async countSuperAdmins(): Promise<number> {
    return this.userModel.countDocuments({ role: Role.SUPER_ADMIN }).exec();
  }

  async updateHashedRefreshToken(
    userId: string,
    hashedRefreshToken: string | null,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(userId, { hashedRefreshToken }, { new: true })
      .exec();
  }

  async deleteById(userId: string): Promise<UserDocument | null> {
    return this.userModel.findByIdAndDelete(userId).exec();
  }
}
