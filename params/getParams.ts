import {LiveParams} from "./live";
import {DeploymentParams} from './deployment';

const {NETWORK_KEY} = process.env;
const liveParams = LiveParams[NETWORK_KEY!];
const deploymentParams = DeploymentParams[NETWORK_KEY!];

export function getLiveParams() {
    return liveParams;
}

export function getDeploymentParams() {
    return deploymentParams;
}
