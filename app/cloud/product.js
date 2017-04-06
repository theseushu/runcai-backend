import _union from 'lodash/union';
import _isUndefined from 'lodash/isUndefined';
import _map from 'lodash/map';
import AV from 'leanengine';
import { statusValues } from '../appConstants';
import { products as productSchemas } from './shemas';
import { generateKeywords } from '../utils/productUtils';

AV.Cloud.define('createProduct', async (request, response) => {
  try {
    const { sessionToken, currentUser,  params: { type, ...attrs } } = request;
    const schema = productSchemas[type];
    const { table, attributes } = schema;
    const product = new Class();
    if (status !== statusValues.unverified) { // new product can be only unavailable or unverified (未上架/已上架)
      attrs.status = statusValues.unavailable;
    }
    try {
      _map(attrs, (value, key) => {
        if (!_isUndefined(value)) {
          const attrSchema = attributes[key];
          if (!attrSchema || !attrSchema.create) {
            throw new Error(`Unsupported attr(${key}) in ${table} creating`);
          }
          attrSchema.create(AV, product, value);
        }
      });
      product.set('keywords', generateKeywords(schema.type, params));
      const { status } = attrs;
      if (product)
      const savedProduct = await product.save(null, {
        fetchWhenSave: true,
        sessionToken,
      });
      return { ...savedProduct.toJSON(), ...attrs };
    } catch (err) {
      debug(err);
      throw err;
    }
    response.success(result);
  } catch (err) {
    console.error(err);
    response.error(err);
  }
});

const createQuery = (schema, { sort, page, pageSize, ...params }) => {
  const { table, attributes } = schema;
  const query = new AV.Query(table)
    .include(_union(..._map(attributes, (attr) => attr.include)));
  _map(params, (value, key) => {
    if (!_isUndefined(value)) {
      const attrSchema = attributes[key];
      if (!attrSchema || !attrSchema.search) {
        throw new Error(`Unsupported attr(${key}) in ${table} searching`);
      }
      attrSchema.search(AV, query, value);
    }
  });
  if (sort && sort.sort) {
    if (sort.order === 'asc') {
      query.addAscending(sort.sort);
    } else {
      query.addDescending(sort.sort);
    }
  }
  if (page && pageSize) {
    query
      .skip((page - 1) * pageSize)
      .limit(pageSize);
  }
  return query;
};

AV.Cloud.define('pageProducts', async (request, response) => {
  try {
    const { sessionToken, currentUser,  params } = request;
    // const { type, owner, shop, category, species, location, status, keywords, sort, page, pageSize  }
    const { type, sort, page, pageSize, owner, ...otherParams } = params;
    const schema = productSchemas[type];
    if (!schema) {
      throw new Error(`Unknown type ${type}`);
    }
    let status = [];
    if (owner && owner.objectId === currentUser.id) {
      if (params.status) {
        status = params.status.filter((value) => value !== statusValues.unverified.value && value !== statusValues.verified.value && value !== statusValues.rejected.value);
        if (params.status.length !== status.length) {
          console.warn(`You've set illegal status in query. available values are [${statusValues.unverified.value}, ${statusValues.verified.value}, ${statusValues.rejected.value}]`);
        }
      } else {
        status = [statusValues.unverified.value, statusValues.verified.value, statusValues.rejected.value];
      }
    } else {
      if (params.status) {
        console.warn('You shall not set status as query param when not querying products of yourself');
      }
      status = [statusValues.unverified.value, statusValues.verified.value];
    }
    const query = createQuery(schema, { sort, page, pageSize, ...otherParams, owner, status });
    const countQuery = createQuery(schema, { ...otherParams, owner, status });
    const [count, products] = await Promise.all([countQuery.count({ sessionToken }), query.find({ sessionToken })]);

    const result = {
      total: count,
      totalPages: Math.ceil(count / page),
      page,
      pageSize,
      first: page === 1,
      last: count <= page * pageSize,
      results: products,
    }
    response.success(result);
  } catch (err) {
    console.error(err);
    response.error(err);
  }
});
