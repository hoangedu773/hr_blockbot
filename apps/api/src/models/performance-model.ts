import mongoose, { Schema } from 'mongoose';
import type { z } from 'zod';
/** Strict DTO validation owns nested fields; mongoose owns indexes/outer shape. */
export function performanceModel(name:string, collection:string, contract:z.ZodTypeAny, indexes:Array<[Record<string,1|-1>,Record<string,any>?]> = []) {
 const shape=(contract as any)._def.schema?.shape ?? (contract as any).shape;
 const fields:Record<string,any>={_id:{type:String,required:true}};
 for(const key of Object.keys(shape ?? {}))if(key!=='id')fields[key]={type:Schema.Types.Mixed};
 const schema=new Schema(fields,{collection,versionKey:false,strict:'throw',autoCreate:false,autoIndex:false});
 schema.pre('validate',function(){const {_id,...body}=this.toObject();contract.parse({id:String(_id),...body});});
 for(const [keys,options]of indexes)schema.index(keys,options??{});
 return mongoose.models[name]??mongoose.model(name,schema);
}
