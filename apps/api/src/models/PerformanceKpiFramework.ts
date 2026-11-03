import { PerformanceFrameworkSchema } from '@hr-blockbot/contracts';
import { performanceModel } from './performance-model.js';
export const PerformanceKpiFrameworkModel=performanceModel('PerformanceKpiFramework','performance_kpi_frameworks',PerformanceFrameworkSchema,[[{'content.role':1,'content.frameworkVersion':1},{unique:true}]]);
