import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ProjectProgressSchema} from '../dist/index.js';
test('progress accepts legacy CAS requests and a bounded nonempty optional message ID',()=>{assert.equal(ProjectProgressSchema.safeParse({progress:50,expectedVersion:1}).success,true);assert.equal(ProjectProgressSchema.safeParse({progress:50,expectedVersion:1,clientMessageId:' retry-1 '}).data.clientMessageId,'retry-1');for(const clientMessageId of ['', ' ', 'x'.repeat(101),42])assert.equal(ProjectProgressSchema.safeParse({progress:50,expectedVersion:1,clientMessageId}).success,false);});
