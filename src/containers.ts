import { Duration, TemporalUnit } from "node-duration";
import { GenericContainer, Wait } from "testcontainers";
import {
  StartedTestContainer,
  TestContainer
} from "testcontainers/dist/test-container";
import {
  EnvironmentVariableMap,
  JestTestcontainersConfig,
  SingleContainerConfig,
  WaitConfig
} from "./config";

const addWaitStrategyToContainer = (waitStrategy?: WaitConfig) => (
  container: TestContainer
): TestContainer => {
  if (waitStrategy === undefined) {
    return container;
  }
  if (waitStrategy.type === "ports") {
    return container.withStartupTimeout(
      new Duration(waitStrategy.timeout, TemporalUnit.SECONDS)
    );
  }
  if (waitStrategy.type === "text") {
    return container.withWaitStrategy(Wait.forLogMessage(waitStrategy.text));
  }
  throw new Error("unknown wait strategy for container");
};

const addEnvironmentVariablesToContainer = (env?: EnvironmentVariableMap) => (
  container: TestContainer
): TestContainer => {
  if (env === undefined) {
    return container;
  }
  return Object.keys(env).reduce(
    (newContainer, key) => newContainer.withEnv(key, env[key]),
    container
  );
};

const addPortsToContainer = (ports?: number[]) => (
  container: TestContainer
): TestContainer => {
  if (!Array.isArray(ports) || ports.length <= 0) {
    return container;
  }
  return container.withExposedPorts(...ports);
};

const addNameToContainer = (name?: string) => (
  container: GenericContainer
): TestContainer => {
  if (name === undefined) {
    return container;
  }
  return container.withName(name);
};

export function buildTestcontainer(
  containerConfig: SingleContainerConfig
): TestContainer {
  const { image, tag, ports, name, env, wait } = containerConfig;
  const container = new GenericContainer(image, tag);

  return [
    addPortsToContainer(ports),
    addEnvironmentVariablesToContainer(env),
    addWaitStrategyToContainer(wait)
  ].reduce<TestContainer>(
    (res, func) => func(res),
    addNameToContainer(name)(container)
  );
}

export interface StartedContainerAndMetaInfo {
  ip: string;
  name: string;
  portMappings: Map<number, number>;
  container: StartedTestContainer;
}

export function getMetaInfo(
  container: StartedTestContainer,
  ports?: number[]
): StartedContainerAndMetaInfo {
  const portMappings = new Map<number, number>();

  return {
    container,
    ip: container.getContainerIpAddress(),
    name: container.getName(),
    portMappings: (ports || []).reduce(
      (mapping, p: number) =>
        container.getMappedPort(p)
          ? mapping.set(p, container.getMappedPort(p))
          : mapping,
      portMappings
    )
  };
}

export async function startContainer(
  containerConfig: SingleContainerConfig,
  containerBuilderFn: typeof buildTestcontainer = buildTestcontainer,
  infoGetterFn: typeof getMetaInfo = getMetaInfo
): Promise<StartedContainerAndMetaInfo> {
  const container = containerBuilderFn(containerConfig);
  const startedContainer = await container.start();

  return infoGetterFn(startedContainer, containerConfig.ports);
}

export type AllStartedContainersAndMetaInfo = {
  [key: string]: StartedContainerAndMetaInfo;
};
export async function startAllContainers(
  config: JestTestcontainersConfig,
  startContainerFn: typeof startContainer = startContainer
): Promise<AllStartedContainersAndMetaInfo> {
  const containerKeys = Object.keys(config);
  const containerConfigs = Object.values(config);
  const startedContainersMetaInfos = await Promise.all(
    containerConfigs.map(containerConfig => startContainerFn(containerConfig))
  );

  return containerKeys.reduce(
    (acc, key, idx) => ({ ...acc, [key]: startedContainersMetaInfos[idx] }),
    {}
  );
}
