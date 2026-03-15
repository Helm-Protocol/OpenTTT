import { BigInt, BigDecimal } from "@graphprotocol/graph-ts"
import { PoTAnchored } from "../generated/TTT/TTT"
import { SwapVerified } from "../generated/TTTHook/TTTHook"
import {
  PoTAnchor,
  SwapVerification,
  DailyStats,
  HourlyStats,
} from "../generated/schema"

export function handlePoTAnchored(event: PoTAnchored): void {
  let id = event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  let entity = new PoTAnchor(id)

  entity.stratum = event.params.stratum
  entity.grgHash = event.params.grgHash
  entity.potHash = event.params.potHash
  entity.timestamp = event.params.timestamp
  entity.blockNumber = event.block.number
  entity.txHash = event.transaction.hash

  entity.save()
}

export function handleSwapVerified(event: SwapVerified): void {
  // --- SwapVerification entity ---
  let id = event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  let swap = new SwapVerification(id)

  swap.hook = event.params.hook
  swap.pool = event.params.pool
  swap.sender = event.params.sender
  swap.mode = event.params.mode
  swap.feeAmount = event.params.feeAmount
  swap.timestamp = event.block.timestamp
  swap.blockNumber = event.block.number
  swap.txHash = event.transaction.hash

  // Link to PoTAnchor if one exists with matching potHash
  let potHash = event.params.potHash
  // potAnchor linking is left as null — can be set via potHash lookup in future
  swap.potAnchor = null

  swap.save()

  // --- DailyStats ---
  let daySeconds = BigInt.fromI32(86400)
  let dayTimestamp = event.block.timestamp.div(daySeconds).times(daySeconds)
  let dayId = dayTimestamp.toString()
  let daily = DailyStats.load(dayId)
  if (daily == null) {
    daily = new DailyStats(dayId)
    daily.date = dayId
    daily.totalSwaps = BigInt.fromI32(0)
    daily.turboCount = BigInt.fromI32(0)
    daily.fullCount = BigInt.fromI32(0)
    daily.turboRatio = BigDecimal.fromString("0")
    daily.totalFees = BigInt.fromI32(0)
  }
  daily.totalSwaps = daily.totalSwaps.plus(BigInt.fromI32(1))
  daily.totalFees = daily.totalFees.plus(event.params.feeAmount)

  if (event.params.mode == "turbo") {
    daily.turboCount = daily.turboCount.plus(BigInt.fromI32(1))
  } else {
    daily.fullCount = daily.fullCount.plus(BigInt.fromI32(1))
  }

  if (daily.totalSwaps.gt(BigInt.fromI32(0))) {
    daily.turboRatio = daily.turboCount
      .toBigDecimal()
      .div(daily.totalSwaps.toBigDecimal())
  }

  daily.save()

  // --- HourlyStats ---
  let hourSeconds = BigInt.fromI32(3600)
  let hourTimestamp = event.block.timestamp.div(hourSeconds).times(hourSeconds)
  let hourId = hourTimestamp.toString()
  let hourly = HourlyStats.load(hourId)
  if (hourly == null) {
    hourly = new HourlyStats(hourId)
    hourly.hour = hourId
    hourly.totalSwaps = BigInt.fromI32(0)
    hourly.turboCount = BigInt.fromI32(0)
    hourly.fullCount = BigInt.fromI32(0)
  }
  hourly.totalSwaps = hourly.totalSwaps.plus(BigInt.fromI32(1))

  if (event.params.mode == "turbo") {
    hourly.turboCount = hourly.turboCount.plus(BigInt.fromI32(1))
  } else {
    hourly.fullCount = hourly.fullCount.plus(BigInt.fromI32(1))
  }

  hourly.save()
}
