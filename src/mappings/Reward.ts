import { Account, StakingResult } from '../types';
import {SubstrateEvent} from "@subql/types";
import {Balance} from '@polkadot/types/interfaces';
import {NoBondRecordAccount} from "../types/models/NoBondRecordAccount";
import Big from 'big.js' 

function createAccountRecord(accountId: string): Account {
    const entity = new Account(accountId);
    entity.totalRewards = BigInt(0);
    entity.totalSlashes = BigInt(0);
    entity.accountTotal = BigInt(0);
    entity.currentStake = BigInt(0);
    entity.stakingResults = []
    entity.apr = '0';
    return entity;
}

function calculateAPR(acc: Account, event: SubstrateEvent): string {
    const epochSlots = api.consts.babe.epochDuration.toNumber();    
    const epochHours = epochSlots / 600  //how many hours in 1 epoch
    const epochsYear = (8760 / epochHours) //how many epochs in a year

    const dateBound = event.block.timestamp;
    dateBound.setFullYear(dateBound.getFullYear() - 1);

    let n = 0; //number of epochs staked
    let interest = Big(0);

    acc.stakingResults.map((entry: StakingResult) => {
        if (dateBound <= entry.date){
            const amount = Big(entry.amount)
            {entry.isReward ? interest = interest.add(amount) : interest = interest.sub(amount)}
            n = n + 1
        }
    })
    
    if(n && acc.currentStake){ //prevent dividends of 0
        const currentStake = new Big(acc.currentStake.toString())
        const x = interest.div(currentStake).div(n)
        const apr = x.times(epochsYear).times(100)
        // logger.info('-------------------')
        // logger.info(acc.id)

        // logger.info(acc.totalRewards.toString()) 
        // logger.info(acc.totalSlashes.toString())
        // logger.info(interest.toPrecision())
        // logger.info(acc.currentStake.toString())

        // logger.info(n)
        // logger.info(x.toPrecision())
        // logger.info(apr.toPrecision())
        // logger.info('-------------------')

        const result = apr.toFixed(2).toString()
        return result
    } else {
        return '0'
    }
}

//This handle bond only creates a new sum reward when Bonded event happens
//I need to keep track of the bond amount (principle)
export async function handleBond(event: SubstrateEvent): Promise<void> {
    const {event: {data: [account, balance]}} = event;
    let entity = await Account.get(account.toString());
    if (entity === undefined){
        entity = createAccountRecord(account.toString())
        await entity.save()
    }
    
    entity = await Account.get(account.toString())
    
    entity.currentStake += (balance as Balance).toBigInt();
    await entity.save() 

    // logger.info(`currStake: ${entity.currentStake}, accountID: ${entity.id}`)
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
