import { Account } from '../types';
import {SubstrateEvent} from "@subql/types";
import {Balance} from '@polkadot/types/interfaces';
import {NoBondRecordAccount} from "../types/models/NoBondRecordAccount";
import { calculateAPR, createAccountRecord } from '../helpers';

export async function handleBond(event: SubstrateEvent): Promise<void> {
    const {event: {data: [account, balance]}} = event;
    let entity = await Account.get(account.toString());
    if (entity === undefined){
        entity = createAccountRecord(account.toString())
    }
        
    entity.currentStake += (balance as Balance).toBigInt();
    await entity.save() 
}

export async function handleUnbond(event: SubstrateEvent): Promise<void> {
    const {event: {data: [account, balance]}} = event;
    let entity = await Account.get(account.toString());

    if(entity !== undefined){
        entity.currentStake -= (balance as Balance).toBigInt();
        await entity.save()
    }
}

export async function handleReward(event: SubstrateEvent): Promise<void> {
    const {event: {data: [account, newReward]}} = event;
    let entity = await Account.get(account.toString());
    if (entity === undefined){
        // in early stage of kusama, some validators didn't need to bond to start staking
        // to not break our code, we will create a SumReward record for them and log them in NoBondRecordAccount
        entity = createAccountRecord(account.toString());
        const errorRecord = new NoBondRecordAccount(account.toString());
        errorRecord.firstRewardAt = event.block.block.header.number.toNumber();
        await errorRecord.save();
    }

    entity.totalRewards += (newReward as Balance).toBigInt();
    entity.currentStake += (newReward as Balance).toBigInt(); 

    entity.stakingResults.push({date: event.block.timestamp, isReward: true, amount: (newReward as Balance).toString()})    

    entity.accountTotal = entity.totalRewards - entity.totalSlashes;  

    entity.apr = calculateAPR(entity, event)
    
    await entity.save();
}

export async function handleSlash(event: SubstrateEvent): Promise<void> {
    const {event: {data: [account, newSlash]}} = event;
    let entity = await Account.get(account.toString());
    if (entity === undefined){
        // in early stage of kusama, some validators didn't need to bond to start staking
        // to not break our code, we will create a SumReward record for them and log them in NoBondRecordAccount
        entity = createAccountRecord(account.toString());
        const errorRecord = new NoBondRecordAccount(account.toString());
        errorRecord.firstRewardAt = event.block.block.header.number.toNumber();
        await errorRecord.save();
    }

    entity.totalSlashes += (newSlash as Balance).toBigInt();
    entity.currentStake -= (newSlash as Balance).toBigInt();

    entity.stakingResults.push({date: event.block.timestamp, isReward: false, amount: (newSlash as Balance).toString()})    

    entity.accountTotal = entity.totalRewards - entity.totalSlashes;
    
    entity.apr = calculateAPR(entity, event)
    
    await entity.save();
}
