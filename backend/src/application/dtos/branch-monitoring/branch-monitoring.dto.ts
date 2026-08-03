import { IsIn, IsOptional, Matches } from 'class-validator';

export class BranchMonitoringPeriodDto {
  @IsOptional()
  @IsIn(['day', 'month', 'year'])
  period?: 'day' | 'month' | 'year';

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date phải có định dạng YYYY-MM-DD' })
  date?: string;
}
