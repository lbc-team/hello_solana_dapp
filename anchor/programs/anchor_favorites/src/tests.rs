use std::{fs, path::PathBuf};

use super::*;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use litesvm::LiteSVM;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    transaction::Transaction,
};


// ================================================================
// Unit Tests (原 src/lib.rs 中的单元测试)
// ================================================================

#[test]
fn test_favorites_struct_creation() {
    let favorites = Favorites {
        number: 42,
        color: "blue".to_string(),
    };

    assert_eq!(favorites.number, 42);
    assert_eq!(favorites.color, "blue");
}

#[test]
fn test_favorites_struct_space_calculation() {
    // 测试 InitSpace 计算是否正确
    // number: u64 = 8 bytes
    // color: String with max_len(50) = 4 + 50 = 54 bytes
    // Total: 8 + 54 = 62 bytes
    assert_eq!(Favorites::INIT_SPACE, 62);
}

#[test]
fn test_color_max_length() {
    let long_color = "a".repeat(50);
    let favorites = Favorites {
        number: 100,
        color: long_color.clone(),
    };

    assert_eq!(favorites.color.len(), 50);
    assert_eq!(favorites.color, long_color);
}

#[test]
fn test_favorites_default_values() {
    let favorites = Favorites {
        number: 0,
        color: String::new(),
    };

    assert_eq!(favorites.number, 0);
    assert_eq!(favorites.color, "");
    assert!(favorites.color.is_empty());
}

#[test]
fn test_number_edge_cases() {
    // 测试数字的边界情况
    let max_favorites = Favorites {
        number: u64::MAX,
        color: "red".to_string(),
    };

    let min_favorites = Favorites {
        number: u64::MIN,
        color: "green".to_string(),
    };

    assert_eq!(max_favorites.number, u64::MAX);
    assert_eq!(min_favorites.number, 0);
}

#[test]
fn test_color_unicode_support() {
    // 测试 Unicode 字符支持
    let favorites = Favorites {
        number: 888,
        color: "红色🔴".to_string(),
    };

    assert_eq!(favorites.number, 888);
    assert_eq!(favorites.color, "红色🔴");
}

// ================================================================
// LiteSVM Integration Tests (原 tests/favorites_litesvm.rs 中的集成测试)
// ================================================================

fn program_binary() -> PathBuf {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../../target/deploy/anchor_favorites.so");
    path
}

fn favorites_pda(user: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"favorites", user.as_ref()], &ID).0
}

fn to_pubkey(pubkey: anchor_lang::prelude::Pubkey) -> Pubkey {
    Pubkey::from(pubkey.to_bytes())
}

fn to_account_meta(meta: anchor_lang::prelude::AccountMeta) -> AccountMeta {
    if meta.is_writable {
        AccountMeta::new(Pubkey::from(meta.pubkey.to_bytes()), meta.is_signer)
    } else {
        AccountMeta::new_readonly(Pubkey::from(meta.pubkey.to_bytes()), meta.is_signer)
    }
}

#[test]
fn set_favorites_writes_expected_pda_data() {
    let mut svm = LiteSVM::new();
    let payer = Keypair::new();
    let user = Keypair::new();

    let program_bytes = fs::read(program_binary()).expect("read anchor_favorites.so");
    svm.add_program(to_pubkey(ID), &program_bytes)
        .expect("load favorites program");
    svm.airdrop(&payer.pubkey(), 2_000_000_000)
        .expect("airdrop payer");
    svm.airdrop(&user.pubkey(), 2_000_000_000)
        .expect("airdrop user");

    let favorites = favorites_pda(&user.pubkey());
    let instruction = Instruction {
        program_id: to_pubkey(ID),
        accounts: accounts::SetFavorites {
            user: anchor_lang::prelude::Pubkey::new_from_array(user.pubkey().to_bytes()),
            favorites: anchor_lang::prelude::Pubkey::new_from_array(favorites.to_bytes()),
            system_program: anchor_lang::system_program::ID,
        }
        .to_account_metas(None)
        .into_iter()
        .map(to_account_meta)
        .collect(),
        data: instruction::SetFavorites {
            number: 42,
            color: "blue".to_string(),
        }
        .data(),
    };

    let tx = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
        &[&payer, &user],
        svm.latest_blockhash(),
    );

    svm.send_transaction(tx).expect("execute set_favorites");

    let favorites_account = svm
        .get_account(&favorites)
        .expect("favorites pda account should exist");
    let mut data = favorites_account.data.as_slice();
    let favorites_state =
        Favorites::try_deserialize(&mut data).expect("deserialize favorites account");

    assert_eq!(favorites_state.number, 42);
    assert_eq!(favorites_state.color, "blue");
}

#[test]
fn set_favorites_updates_existing_pda() {
    let mut svm = LiteSVM::new();
    let payer = Keypair::new();
    let user = Keypair::new();

    let program_bytes = fs::read(program_binary()).expect("read anchor_favorites.so");
    svm.add_program(to_pubkey(ID), &program_bytes)
        .expect("load favorites program");
    svm.airdrop(&payer.pubkey(), 2_000_000_000)
        .expect("airdrop payer");
    svm.airdrop(&user.pubkey(), 2_000_000_000)
        .expect("airdrop user");

    let favorites = favorites_pda(&user.pubkey());

    for (number, color) in [(7_u64, "red"), (99_u64, "green")] {
        let instruction = Instruction {
            program_id: to_pubkey(ID),
            accounts: accounts::SetFavorites {
                user: anchor_lang::prelude::Pubkey::new_from_array(user.pubkey().to_bytes()),
                favorites: anchor_lang::prelude::Pubkey::new_from_array(favorites.to_bytes()),
                system_program: anchor_lang::system_program::ID,
            }
            .to_account_metas(None)
            .into_iter()
            .map(to_account_meta)
            .collect(),
            data: instruction::SetFavorites {
                number,
                color: color.to_string(),
            }
            .data(),
        };

        let tx = Transaction::new_signed_with_payer(
            &[instruction],
            Some(&payer.pubkey()),
            &[&payer, &user],
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx)
            .expect("execute repeated set_favorites");
    }

    let favorites_account = svm
        .get_account(&favorites)
        .expect("favorites pda account should exist");
    let mut data = favorites_account.data.as_slice();
    let favorites_state =
        Favorites::try_deserialize(&mut data).expect("deserialize favorites account");

    assert_eq!(favorites_state.number, 99);
    assert_eq!(favorites_state.color, "green");
}
