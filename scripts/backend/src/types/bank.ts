/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/bank.json`.
 */
export type Bank = {
  address: "3d6TUS2v5bmZ9489ii1dsasfPossE2zUGhaWjr2gFBKW";
  metadata: {
    name: "bank";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Created with Anchor";
  };
  instructions: [
    {
      name: "createUserAccount";
      discriminator: [146, 68, 100, 69, 63, 46, 182, 199];
      accounts: [
        {
          name: "userAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [117, 115, 101, 114];
              },
              {
                kind: "account";
                path: "owner";
              },
            ];
          };
        },
        {
          name: "owner";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [];
    },
    {
      name: "deposit";
      discriminator: [242, 35, 198, 137, 82, 225, 242, 182];
      accounts: [
        {
          name: "bank";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 97, 110, 107];
              },
            ];
          };
        },
        {
          name: "userAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [117, 115, 101, 114];
              },
              {
                kind: "account";
                path: "depositor";
              },
            ];
          };
        },
        {
          name: "depositor";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
    {
      name: "withdraw";
      discriminator: [183, 18, 70, 156, 148, 109, 161, 34];
      accounts: [
        {
          name: "bank";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [98, 97, 110, 107];
              },
            ];
          };
        },
        {
          name: "userAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [117, 115, 101, 114];
              },
              {
                kind: "account";
                path: "receiver";
              },
            ];
          };
        },
        {
          name: "receiver";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
      ];
    },
  ];
  accounts: [
    {
      name: "userAccount";
      discriminator: [211, 33, 136, 16, 186, 110, 242, 127];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "insufficientFunds";
      msg: "";
    },
    {
      code: 6001;
      name: "insufficientBankFunds";
      msg: "";
    },
  ];
  types: [
    {
      name: "userAccount";
      type: {
        kind: "struct";
        fields: [
          {
            name: "depositAmount";
            type: "u64";
          },
        ];
      };
    },
  ];
};
