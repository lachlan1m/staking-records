import { SubstrateEvent } from "@subql/types";
import { Account, StakingResult } from "../types";
import Big from "big.js";

export function calculateAPR(acc: Account, event: SubstrateEvent): string {
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
        return apr.toFixed(2).toString()
    } else {
        return '0.00'
    }
}

export function createAccountRecord(accountId: string): Account {
    const entity = new Account(accountId);
    entity.totalRewards = BigInt(0);
    entity.totalSlashes = BigInt(0);
    entity.accountTotal = BigInt(0);
    entity.currentStake = BigInt(0);
    entity.stakingResults = []
    entity.apr = '0.00';
    return entity;
}