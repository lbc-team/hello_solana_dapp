import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { expect } from "chai";

describe("emit_log", () => {
    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.EmitLog as Program<any>;

    it("emit_log!", async () => {
        // 调用 initialize 方法，使用 confirmed 确保交易已确认
        const tx = await program.methods.initialize().rpc({ commitment: "confirmed" });
        console.log("Your transaction signature:", tx);

        // 获取并打印 msg!() 日志
        const txInfo = await anchor.getProvider().connection.getParsedTransaction(tx, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0,
        });

        if (txInfo && txInfo.meta && txInfo.meta.logMessages) {
            console.log("\n📋 Transaction logs:");
            txInfo.meta.logMessages.forEach((log, i) => {
                console.log(`  [${i}] ${log}`);
            });

            // 从日志中解析 Anchor 事件（兼容 Surfpool，不依赖 WebSocket）
            const events: any[] = [];
            const prefix = "Program data: ";
            for (const log of txInfo.meta.logMessages) {
                if (log.startsWith(prefix)) {
                    const base64 = log.slice(prefix.length);
                    const event = program.coder.events.decode(base64);
                    if (event) {
                        console.log(`✅ Event captured: ${event.name}`, event.data);
                        events.push(event);
                    }
                }
            }

            console.log(`\n🎯 Total events captured: ${events.length}`);
            expect(events.length).to.equal(2);
            expect(events[0].name).to.equal("MyEvent");
            expect(events[0].data.value.toNumber()).to.equal(12);
            expect(events[1].name).to.equal("MySecondEvent");
            expect(events[1].data.value.toNumber()).to.equal(3);
            expect(events[1].data.message).to.equal("hello world");
        } else {
            throw new Error("No log messages found in transaction");
        }
    });
});

