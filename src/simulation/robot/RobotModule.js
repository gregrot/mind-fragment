export class RobotModule {
  constructor(definition) {
    if (!definition?.id) {
      throw new Error('Robot modules must define an id.');
    }
    this.definition = {
      id: definition.id,
      title: definition.title ?? definition.id,
      attachment: {
        slot: definition?.attachment?.slot,
        index: definition?.attachment?.index,
      },
      provides: Array.isArray(definition?.provides)
        ? [...new Set(definition.provides)]
        : [],
      requires: Array.isArray(definition?.requires)
        ? [...new Set(definition.requires)]
        : [],
      capacityCost: Number.isFinite(definition?.capacityCost)
        ? definition.capacityCost
        : 1,
    };
  }

  onAttach() {}

  onDetach() {}

  update() {}
}
