function splitNames(value) {
  return String(value)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

function assertKnown(names, available) {
  const unknown = names.filter((name) => !available.includes(name));

  if (unknown.length > 0) {
    throw new Error(
      `Unknown skill(s): ${unknown.join(', ')}. Available: ${available.join(', ')}`,
    );
  }
}

export function selectSkills(available, { skills, except }) {
  if (skills !== undefined && except !== undefined) {
    throw new Error('Use either "skills" or "except", not both.');
  }

  if (skills !== undefined) {
    const names = splitNames(skills);
    assertKnown(names, available);
    return names;
  }

  if (except !== undefined) {
    const names = splitNames(except);
    assertKnown(names, available);
    return available.filter((name) => !names.includes(name));
  }

  return available;
}
