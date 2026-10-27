use super::*;
use anchor_lang::{AccountDeserialize, AccountSerialize, Discriminator};

#[test]
fn test_data_store_creation() {
    let store = DataStore { data: 42 };
    assert_eq!(store.data, 42);
}

#[test]
fn test_data_store_edge_cases() {
    let store_min = DataStore { data: u64::MIN };
    assert_eq!(store_min.data, 0);

    let store_max = DataStore { data: u64::MAX };
    assert_eq!(store_max.data, u64::MAX);
}

#[test]
fn test_data_store_discriminator_and_space() {
    // 验证账户 discriminator 长度为 8 字节
    assert_eq!(DataStore::DISCRIMINATOR.len(), 8);
    // 8 字节 discriminator + 8 字节 u64 = 16 字节 (即 Initialize 中指定的 space = 8 + 8)
    let total_space = DataStore::DISCRIMINATOR.len() + std::mem::size_of::<u64>();
    assert_eq!(total_space, 16);
}

#[test]
fn test_data_store_serialization_and_deserialization() {
    let store = DataStore { data: 88888 };
    let mut buffer = Vec::new();

    // 序列化（包含 8 字节账户鉴别器 discriminator + 8 字节 u64）
    store.try_serialize(&mut buffer).expect("serialize failed");
    assert_eq!(buffer.len(), 16);
    assert_eq!(&buffer[..8], DataStore::DISCRIMINATOR);

    // 反序列化并校验数据
    let mut slice = buffer.as_slice();
    let deserialized = DataStore::try_deserialize(&mut slice).expect("deserialize failed");
    assert_eq!(deserialized.data, 88888);
}

#[test]
fn test_data_store_deserialization_wrong_discriminator() {
    // 构造全为 0 的无效 discriminator buffer
    let buffer = vec![0u8; 16];
    let mut slice = buffer.as_slice();
    let result = DataStore::try_deserialize(&mut slice);
    assert!(result.is_err());
}
