import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Form } from '../entities/form.entity';
import { FormSubmission } from '../entities/form-submission.entity';
import { FormsController } from './forms.controller';
import { FormSubmissionsController } from './form-submissions.controller';
import { FormsService } from './forms.service';

@Module({
  imports: [TypeOrmModule.forFeature([Form, FormSubmission])],
  // FormSubmissionsController (the narrow @Public() sub-route) registered
  // first, same defensive ordering convention as PaymentProxyModule — not
  // strictly required here (`:id/submissions` is 2 segments deep, `:id` is
  // 1, so they can't collide per the same route-collision reasoning
  // elsewhere in this repo), but consistent with the rest of the repo.
  controllers: [FormSubmissionsController, FormsController],
  providers: [FormsService],
  exports: [FormsService],
})
export class FormsModule {}
