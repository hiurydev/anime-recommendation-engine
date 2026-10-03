import * as userService from '../services/userService.js';

export async function create(req, res, next) {
  try {
    const user = await userService.createUser(req.body.name);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const data = await userService.listUsers();
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function detail(req, res, next) {
  try {
    const user = await userService.getUser(req.params.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    await userService.deleteUser(req.params.userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
