import { Request, Response, NextFunction } from 'express';
import { version } from '../../package.json';

export const apiVersionHeader = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.setHeader('X-API-Version', version);
  next();
};