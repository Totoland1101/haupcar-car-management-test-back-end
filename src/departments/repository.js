const { Op, UniqueConstraintError, col, fn } = require('sequelize');

class DuplicateDepartmentError extends Error {}

function createDepartmentRepository({ Department, Profile }) {
  async function peopleCounts() {
    const rows = await Profile.count({ where: { departmentId: { [Op.ne]: null } }, group: ['departmentId'] });
    return new Map(rows.map((row) => [row.departmentId, row.count]));
  }

  function toDepartment(department, counts) {
    return { id: department.id, name: department.name, userCount: counts.get(department.id) ?? 0 };
  }

  async function save(action) {
    try {
      return await action();
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new DuplicateDepartmentError('A department with this name already exists');
      }
      throw err;
    }
  }

  return {
    async list() {
      const [departments, counts] = await Promise.all([
        Department.findAll({ order: [[fn('lower', col('name')), 'ASC']] }),
        peopleCounts(),
      ]);
      return departments.map((department) => toDepartment(department, counts));
    },

    async create({ name }) {
      const department = await save(() => Department.create({ name }));
      return toDepartment(department, await peopleCounts());
    },

    async update(id, { name }) {
      const department = await Department.findByPk(id);
      if (!department) return null;
      await save(() => department.update({ name }));
      return toDepartment(department, await peopleCounts());
    },

    // People in the department keep their accounts and lose the department (ON DELETE SET NULL).
    async remove(id) {
      const deleted = await Department.destroy({ where: { id } });
      return deleted > 0;
    },
  };
}

module.exports = { DuplicateDepartmentError, createDepartmentRepository };
