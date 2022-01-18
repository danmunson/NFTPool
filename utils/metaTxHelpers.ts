import * as sigUtil from '@metamask/eth-sig-util';

type address = string;
type bytesInHex = string;

export type MetaTxInput = {
    name: string
    version: string
    chainId: number
    verifyingContract: address
    nonce: number
    from: address
    functionSignature: bytesInHex
}

const typeSpec = {
    EIP712Domain: [{
        name: 'name',
        type: 'string'
    }, {
        name: 'version',
        type: 'string'
    }, {
        name: 'verifyingContract',
        type: 'address'
    }, {
        name: 'salt',
        type: 'bytes32'
    }],
    MetaTransaction: [{
        name: 'nonce',
        type: 'uint256'
    }, {
        name: 'from',
        type: 'address'
    }, {
        name: 'functionSignature',
        type: 'bytes'
    }]
};

const primaryType = 'MetaTransaction';

export type MetaTxTypedData = {
    types: typeof typeSpec
    domain: {
        name: string
        version: string
        verifyingContract: address
        salt: bytesInHex
    }
    primaryType: typeof primaryType
    message: {
        nonce: number
        from: address
        functionSignature: bytesInHex
    }
}

/*
Source: https://github.com/maticnetwork/pos-portal/blob/master/test/helpers/meta-tx.js
*/
export function getTypedData(input: MetaTxInput): MetaTxTypedData {
    const {name, version, chainId, verifyingContract, nonce, from, functionSignature} = input;
    return {
        types: typeSpec,
        primaryType,
        domain: {
            name,
            version,
            verifyingContract,
            salt: '0x' + (chainId.toString(16).padStart(64, '0'))
        },
        message: {
            nonce,
            from,
            functionSignature
        }
    }
}

export type SignatureParams = {
    r: string
    s: string
    v: number
}

/*
Source: https://github.com/maticnetwork/pos-portal/blob/master/test/helpers/utils.js
*/
export function getSignatureParameters(signature: bytesInHex): SignatureParams {
    const r = signature.slice(0, 66)
    const s = '0x'.concat(signature.slice(66, 130))
    const _v = '0x'.concat(signature.slice(130, 132))
    let v = parseInt(_v)
    if (![27, 28].includes(v)) v += 27
    return { r, s, v };
}

export function recoverMetaTxSignature(typedData: MetaTxTypedData, signature: bytesInHex): bytesInHex {
    return sigUtil.recoverTypedSignature({
        // typecast is necessary because WETH uses the "salt" field for specifying the chainId
        data: typedData as any,
        signature: signature,
        version: sigUtil.SignTypedDataVersion.V3,
    });
}

export function signMetaTxTypedData(typedData: MetaTxTypedData, privateKey: string) {
    const pkBuffer = toBuffer(privateKey);
    return sigUtil.signTypedData({
        // typecast is necessary because WETH uses the "salt" field for specifying the chainId
        data: typedData as any,
        privateKey: pkBuffer,
        version: sigUtil.SignTypedDataVersion.V3,
    });
}

export function toBuffer(bytes: bytesInHex): Buffer {
    if (bytes.startsWith('0x')) bytes = bytes.slice(2);
    if (bytes.length % 2 !== 0) {
        throw new Error('Bytestring improperly formatted; odd number of characters.');
    }
    return Buffer.from(bytes, 'hex');
}